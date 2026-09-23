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

export type GeminiCallKind = 'situation' | 'card';

export interface GeminiCall {
  apiKey: string;
  kind: GeminiCallKind;
  message: string;
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

  callsOf(kind: GeminiCallKind): GeminiCall[] {
    return this.calls.filter((call) => call.kind === kind);
  },
};

const USAGE = { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 10 };
const INVALID = { text: JSON.stringify({ unexpected: true }), usageMetadata: USAGE };

function kindOf(config: { responseJsonSchema?: { properties?: Record<string, unknown> } } | undefined): GeminiCallKind {
  return 'discussion_hooks' in (config?.responseJsonSchema?.properties ?? {}) ? 'situation' : 'card';
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
