import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseSummaryJson, getOpenAI, transcribeAudio, summarizeText } from "../openai";
import { PipelineError } from "../errors";

describe("parseSummaryJson", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({
      overview: "A summary.",
      key_topics: ["Topic A", "Topic B"],
    });
    const result = parseSummaryJson(raw);
    expect(result.overview).toBe("A summary.");
    expect(result.keyTopics).toEqual(["Topic A", "Topic B"]);
  });

  it("rejects empty input as retriable malformed", () => {
    expect(() => parseSummaryJson("")).toThrow(PipelineError);
    try {
      parseSummaryJson("");
    } catch (err) {
      expect((err as PipelineError).code).toBe("PIPE_SUMMARIZE_MALFORMED");
      expect((err as PipelineError).retriable).toBe(true);
    }
  });

  it("rejects invalid JSON", () => {
    expect(() => parseSummaryJson("not json")).toThrow(PipelineError);
  });

  it("rejects missing overview", () => {
    expect(() => parseSummaryJson(JSON.stringify({ key_topics: [] }))).toThrow(
      PipelineError,
    );
  });

  it("rejects non-string key_topics entries", () => {
    const raw = JSON.stringify({ overview: "x", key_topics: ["ok", 42] });
    expect(() => parseSummaryJson(raw)).toThrow(PipelineError);
  });
});

describe("openai fake adapter", () => {
  beforeEach(() => {
    process.env.OPENAI_FAKE = "1";
  });
  afterEach(() => {
    delete process.env.OPENAI_FAKE;
  });

  it("returns deterministic transcription when OPENAI_FAKE=1", async () => {
    const res = await transcribeAudio({ filePath: "/tmp/fake" });
    expect(res.language).toBe("en");
    expect(res.segments.length).toBeGreaterThan(0);
    expect(res.segments[0].text.length).toBeGreaterThan(0);
  });

  it("returns deterministic summary when OPENAI_FAKE=1", async () => {
    const res = await summarizeText({ text: "hello" });
    expect(res.overview.length).toBeGreaterThan(0);
    expect(res.keyTopics.length).toBeGreaterThan(0);
  });

  it("getOpenAI returns the fake adapter with OPENAI_FAKE=1", async () => {
    const adapter = getOpenAI();
    const r = await adapter.transcribeAudio({ filePath: "/tmp/any" });
    expect(r.language).toBe("en");
  });
});
