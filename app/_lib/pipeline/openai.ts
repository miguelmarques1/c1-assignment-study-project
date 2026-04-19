import { createReadStream } from "node:fs";
import { PipelineError } from "./errors";

export type TranscriptSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
};

export type TranscriptionResult = {
  language: string | null;
  segments: TranscriptSegment[];
};

export type SummaryResult = {
  overview: string;
  keyTopics: string[];
};

export type TranscribeParams = {
  filePath: string;
  signal?: AbortSignal;
};

export type SummarizeParams = {
  text: string;
  signal?: AbortSignal;
};

type OpenAIAdapter = {
  transcribeAudio(params: TranscribeParams): Promise<TranscriptionResult>;
  summarizeText(params: SummarizeParams): Promise<SummaryResult>;
};

const WHISPER_TIMEOUT_MS = 5 * 60_000;
const SUMMARY_TIMEOUT_MS = 60_000;

function isFake(): boolean {
  return process.env.OPENAI_FAKE === "1";
}

function resolveApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.length === 0) {
    throw new PipelineError(
      "PIPE_INTERNAL",
      "OPENAI_API_KEY is not set",
      false,
    );
  }
  return key;
}

function resolveWhisperModel(): string {
  return process.env.WHISPER_MODEL || "whisper-1";
}

function resolveSummaryModel(): string {
  return process.env.SUMMARY_MODEL || "gpt-4.1-nano";
}

function mapHttpStatusToPipelineError(
  stage: "transcribe" | "summarize",
  status: number,
  message: string,
): PipelineError {
  const code = stage === "transcribe" ? "PIPE_TRANSCRIBE_API" : "PIPE_SUMMARIZE_API";
  // 408 / 429 / 5xx are retriable; other 4xx are fatal.
  const retriable = status === 408 || status === 429 || status >= 500;
  return new PipelineError(code, `${code} (${status}): ${message}`, retriable);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  external?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PipelineError("PIPE_TIMEOUT", `${label} timed out`, true));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new PipelineError("PIPE_INTERNAL", `${label} aborted`, false));
    };
    if (external) {
      if (external.aborted) onAbort();
      external.addEventListener("abort", onAbort, { once: true });
    }
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function realTranscribe(params: TranscribeParams): Promise<TranscriptionResult> {
  const apiKey = resolveApiKey();
  // Dynamic import so the SDK is not loaded in environments where it isn't used.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const run = client.audio.transcriptions.create({
    file: createReadStream(params.filePath),
    model: resolveWhisperModel(),
    response_format: "verbose_json",
  });

  const response = (await withTimeout(
    run as unknown as Promise<unknown>,
    WHISPER_TIMEOUT_MS,
    "whisper.transcribe",
    params.signal,
  )) as {
    language?: string;
    segments?: Array<{ id?: number; start: number; end: number; text: string }>;
    text?: string;
  };

  const rawSegments = Array.isArray(response.segments) ? response.segments : [];
  const segments: TranscriptSegment[] = rawSegments.map((s, i) => ({
    index: typeof s.id === "number" ? s.id : i,
    start: Number(s.start ?? 0),
    end: Number(s.end ?? s.start ?? 0),
    text: (s.text ?? "").trim(),
  }));
  if (segments.length === 0 && typeof response.text === "string" && response.text.length > 0) {
    segments.push({ index: 0, start: 0, end: 0, text: response.text.trim() });
  }

  return {
    language: typeof response.language === "string" ? response.language : null,
    segments,
  };
}

async function realSummarize(params: SummarizeParams): Promise<SummaryResult> {
  const apiKey = resolveApiKey();
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const systemPrompt = [
    "You are an assistant that summarizes a video transcript.",
    "Return strict JSON with this exact shape:",
    '{"overview": "<one or two paragraphs>", "key_topics": ["<topic>", "<topic>"]}.',
    "The overview must be 1-2 paragraphs of plain prose.",
    "The key_topics list must contain 3-8 short bullet strings (no leading dashes).",
    "Respond with JSON only.",
  ].join(" ");

  const userPrompt = `Transcript of a video:\n\n${params.text}`;

  const run = client.chat.completions.create({
    model: resolveSummaryModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const response = (await withTimeout(
    run as unknown as Promise<unknown>,
    SUMMARY_TIMEOUT_MS,
    "gpt.summarize",
    params.signal,
  )) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = response.choices?.[0]?.message?.content ?? "";
  return parseSummaryJson(content);
}

export function parseSummaryJson(raw: string): SummaryResult {
  if (!raw || raw.trim().length === 0) {
    throw new PipelineError(
      "PIPE_SUMMARIZE_MALFORMED",
      "Empty response from summarizer",
      true,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PipelineError(
      "PIPE_SUMMARIZE_MALFORMED",
      "Summarizer returned non-JSON content",
      true,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PipelineError(
      "PIPE_SUMMARIZE_MALFORMED",
      "Summarizer returned a non-object payload",
      true,
    );
  }
  const obj = parsed as Record<string, unknown>;
  const overview = obj.overview;
  const keyTopics = obj.key_topics;
  if (typeof overview !== "string" || overview.trim().length === 0) {
    throw new PipelineError(
      "PIPE_SUMMARIZE_MALFORMED",
      "Summarizer response is missing 'overview'",
      true,
    );
  }
  if (!Array.isArray(keyTopics) || keyTopics.some((t) => typeof t !== "string")) {
    throw new PipelineError(
      "PIPE_SUMMARIZE_MALFORMED",
      "Summarizer response has invalid 'key_topics'",
      true,
    );
  }
  return {
    overview: overview.trim(),
    keyTopics: (keyTopics as string[]).map((t) => t.trim()).filter((t) => t.length > 0),
  };
}

function fakeAdapter(): OpenAIAdapter {
  return {
    async transcribeAudio(): Promise<TranscriptionResult> {
      // Deterministic output for integration tests.
      return {
        language: "en",
        segments: [
          { index: 0, start: 0, end: 2.5, text: "Hello and welcome to the test." },
          { index: 1, start: 2.5, end: 5.0, text: "This is segment two." },
          { index: 2, start: 5.0, end: 7.5, text: "Goodbye." },
        ],
      };
    },
    async summarizeText(): Promise<SummaryResult> {
      return {
        overview: "A short deterministic summary for integration tests.",
        keyTopics: ["Greeting", "Body", "Farewell"],
      };
    },
  };
}

function realAdapter(): OpenAIAdapter {
  return {
    transcribeAudio: realTranscribe,
    summarizeText: realSummarize,
  };
}

export function getOpenAI(): OpenAIAdapter {
  return isFake() ? fakeAdapter() : realAdapter();
}

export async function transcribeAudio(
  params: TranscribeParams,
): Promise<TranscriptionResult> {
  try {
    return await getOpenAI().transcribeAudio(params);
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    const httpErr = err as { status?: number; message?: string };
    if (typeof httpErr.status === "number") {
      throw mapHttpStatusToPipelineError("transcribe", httpErr.status, httpErr.message ?? String(err));
    }
    throw new PipelineError(
      "PIPE_TRANSCRIBE_API",
      `Whisper call failed: ${(err as Error).message ?? String(err)}`,
      true,
    );
  }
}

export async function summarizeText(
  params: SummarizeParams,
): Promise<SummaryResult> {
  try {
    return await getOpenAI().summarizeText(params);
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    const httpErr = err as { status?: number; message?: string };
    if (typeof httpErr.status === "number") {
      throw mapHttpStatusToPipelineError("summarize", httpErr.status, httpErr.message ?? String(err));
    }
    throw new PipelineError(
      "PIPE_SUMMARIZE_API",
      `Summarizer call failed: ${(err as Error).message ?? String(err)}`,
      true,
    );
  }
}
