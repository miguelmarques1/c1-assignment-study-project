/**
 * A stand-in for `@google/genai`, installed by the scenario suites with
 * `vi.mock('@google/genai', ...)`. It replaces only the network call: F04's
 * `PromptExecutionService` still resolves each caller's own key through the
 * vault, validates the response against the prompt's schema, retries once and
 * writes its telemetry and `credential_usage` rows — which is exactly what the
 * "each card is generated with its own owner's key" criteria need to observe.
 *
 * Every call records the API key it was constructed with, so a test can read
 * which user's key produced which artifact.
 */

export type GeminiCallKind = 'situation' | 'card' | 'analysis';

export interface GeminiCall {
  apiKey: string;
  kind: GeminiCallKind;
  message: string;
}

/** Thrown by the fake to simulate a provider error with an HTTP-shaped status, matching `@google/genai`'s own `ApiError`. */
export class FakeGeminiApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const ROLE_POOL = [
  { label: 'The Traveler', relationship: 'Passenger whose connection was cancelled' },
  { label: 'The Airline Agent', relationship: 'Rebooking desk agent with limited seats' },
  { label: 'The Supervisor', relationship: 'Shift lead who can authorise exceptions' },
  { label: 'The Stranger', relationship: 'Fellow passenger competing for the same seat' },
];

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** One scripted answer for the next `lesson-analysis` call from a given key, consumed in order (F11). */
export type FakeAnalysisStep =
  | { kind: 'ok'; response?: unknown }
  | { kind: 'invalid' }
  | { kind: 'status'; status: number; message?: string }
  | { kind: 'network' }
  | { kind: 'empty' };

export const gemini = {
  calls: [] as GeminiCall[],
  situationsServed: 0,
  /** Upcoming situation attempts answered with schema-invalid output. */
  failSituations: 0,
  /** Keys whose card attempts are answered with schema-invalid output. */
  failCardKeys: new Set<string>(),
  /** Answer situations with one role fewer than the seats asked for. */
  shortOnRoles: false,
  /** What the model echoes as `vocabulary_domain` — never what the server persists. */
  echoedDomain: 'travel and tourism, loosely',
  situationGate: null as ReturnType<typeof deferred> | null,
  cardGate: null as ReturnType<typeof deferred> | null,
  /** Per-key queue of scripted analysis answers, consumed in order; falls back to a generated default. */
  analysisScripts: new Map<string, FakeAnalysisStep[]>(),
  analysisGate: null as ReturnType<typeof deferred> | null,

  reset(): void {
    this.calls = [];
    this.situationsServed = 0;
    this.failSituations = 0;
    this.failCardKeys = new Set();
    this.shortOnRoles = false;
    this.echoedDomain = 'travel and tourism, loosely';
    this.situationGate?.release();
    this.cardGate?.release();
    this.situationGate = null;
    this.cardGate = null;
    this.analysisScripts = new Map();
    this.analysisGate?.release();
    this.analysisGate = null;
  },

  /** Holds every situation response until the returned function is called. */
  holdSituations(): () => void {
    this.situationGate = deferred();
    return this.situationGate.release;
  },

  /** Holds every card response until the returned function is called. */
  holdCards(): () => void {
    this.cardGate = deferred();
    return this.cardGate.release;
  },

  /** Holds every analysis response until the returned function is called. */
  holdAnalyses(): () => void {
    this.analysisGate = deferred();
    return this.analysisGate.release;
  },

  /** Queues one or more answers for the next `lesson-analysis` call(s) from this key. */
  scriptAnalysis(apiKey: string, ...steps: FakeAnalysisStep[]): void {
    this.analysisScripts.set(apiKey, [...(this.analysisScripts.get(apiKey) ?? []), ...steps]);
  },

  callsOf(kind: GeminiCallKind): GeminiCall[] {
    return this.calls.filter((call) => call.kind === kind);
  },
};

const USAGE = { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 10 };
const INVALID = { text: JSON.stringify({ unexpected: true }), usageMetadata: USAGE };

function kindOf(config: { responseJsonSchema?: { properties?: Record<string, unknown> } } | undefined): GeminiCallKind {
  const properties = config?.responseJsonSchema?.properties ?? {};
  if ('discussion_hooks' in properties) {
    return 'situation';
  }
  if ('competencies' in properties) {
    return 'analysis';
  }
  return 'card';
}

/** Every `[mm:ss] YOU: text` line's own text, in order — what a default analysis quotes verbatim so it matches by construction. */
function extractOwnLines(message: string): string[] {
  const lines: string[] = [];
  for (const line of message.split('\n')) {
    const match = /^\[\d+:\d{2}\] YOU: (.+)$/.exec(line.trim());
    if (match) {
      lines.push(match[1]!.trim());
    }
  }
  return lines;
}

/**
 * A plausible default `lesson-analysis` v2 response. It quotes the first
 * `YOU` line verbatim (so the output rules' quote match succeeds without a
 * test having to script one), and only ever includes `scenario_fit` when
 * the rendered `scenario_status` says a scenario — with a role card — was
 * in play, mirroring what the real prompt would be told.
 */
export function fakeAnalysis(message: string) {
  const ownLines = extractOwnLines(message);
  // `full`'s sentence ends the clause in a period; `situation_only`'s otherwise
  // identical opening continues past a comma instead, so this substring is
  // exact for `full` alone.
  const hasFullScenario = message.includes('A scenario was in play for this lesson.');
  return {
    competencies: {
      grammar: { score: 65, justification: `Grammar note grounded in "${ownLines[0] ?? 'the transcript'}".` },
      vocabulary: { score: 70, justification: 'Reasonable range for the topic at hand.' },
      fluency: { score: 72, justification: 'Few hesitations, a natural pace overall.' },
      interaction: { score: 68, justification: "Responds appropriately to the other side's turns." },
      comprehension: { score: 75, justification: 'Understands and replies on topic throughout.' },
    },
    strengths: ['Communicates clearly despite minor slips.', 'Uses topic-appropriate vocabulary.', 'Keeps a natural pace.'],
    errors:
      ownLines.length > 0
        ? [
            {
              quote: ownLines[0]!,
              tag: 'grammar:conditional-3',
              correction: 'a corrected version of the same sentence',
              explanation: 'A plain-language explanation of the fix.',
              severity: 'moderate' as const,
            },
          ]
        : [],
    recurring_tags: [],
    scenario_fit: hasFullScenario
      ? {
          register_matched: true,
          register_comment: 'Consistent, appropriate register throughout.',
          expressions_attempted: ['with all due respect', 'I would feel more comfortable if'],
        }
      : null,
    topics_to_practice: ['Third conditional in spoken hypotheticals', 'Present perfect vs. past simple', 'Polite disagreement phrases'],
  };
}

export function fakeSituation(seats: number, serial: number) {
  return {
    title: `Stranded at Gate ${serial}`,
    setting: `Terminal ${serial} of a busy airport, late on a stormy evening.`,
    premise: 'The last flight out was cancelled and there are fewer seats than people who need one.',
    roles: ROLE_POOL.slice(0, seats),
    vocabulary_domain: gemini.echoedDomain,
    discussion_hooks: [
      'Who deserves the last seat on the next flight?',
      'What does the airline actually owe its passengers?',
      'Is it ever fair to bend the rules for one person?',
    ],
  };
}

export function fakeCard(roleLabel: string) {
  return {
    background: `Background written for ${roleLabel} alone.`,
    objective: `Objective only ${roleLabel} is pursuing.`,
    constraint: `Constraint only ${roleLabel} is under.`,
    register: 'neutral',
    target_expressions: [
      `first expression for ${roleLabel}`,
      'to be on the safe side',
      'I would feel more comfortable if',
      'with all due respect',
      'let us be realistic',
      'the bottom line is',
    ],
  };
}

class FakeGoogleGenAI {
  private readonly apiKey: string;

  constructor(options: { apiKey: string }) {
    this.apiKey = options.apiKey;
  }

  models = {
    generateContent: async ({
      contents,
      config,
    }: {
      contents: unknown;
      config?: { responseJsonSchema?: { properties?: Record<string, unknown> } };
    }) => {
      const message = String(contents);
      const kind = kindOf(config);
      gemini.calls.push({ apiKey: this.apiKey, kind, message });

      if (kind === 'situation') {
        await gemini.situationGate?.promise;
        if (gemini.failSituations > 0) {
          gemini.failSituations -= 1;
          return INVALID;
        }
        const asked = Number(/for (\d+) participants/.exec(message)?.[1] ?? 2);
        const seats = gemini.shortOnRoles ? asked - 1 : asked;
        gemini.situationsServed += 1;
        return { text: JSON.stringify(fakeSituation(seats, gemini.situationsServed)), usageMetadata: USAGE };
      }

      if (kind === 'analysis') {
        await gemini.analysisGate?.promise;
        const step = gemini.analysisScripts.get(this.apiKey)?.shift() ?? { kind: 'ok' as const };
        switch (step.kind) {
          case 'status':
            throw new FakeGeminiApiError(step.status, step.message ?? `HTTP ${step.status}`);
          case 'network':
            throw new Error('fetch failed');
          case 'invalid':
            return INVALID;
          case 'empty':
            return { text: '', usageMetadata: USAGE };
          case 'ok':
            return { text: JSON.stringify(step.response ?? fakeAnalysis(message)), usageMetadata: USAGE };
        }
      }

      await gemini.cardGate?.promise;
      if (gemini.failCardKeys.has(this.apiKey)) {
        return INVALID;
      }
      const roleLabel = /This card is for the role: (.+)/.exec(message)?.[1]?.trim() ?? 'Unknown';
      return { text: JSON.stringify(fakeCard(roleLabel)), usageMetadata: USAGE };
    },
  };
}

export const fakeGeminiModule = {
  GoogleGenAI: FakeGoogleGenAI,
  ThinkingLevel: { LOW: 'LOW' },
};
