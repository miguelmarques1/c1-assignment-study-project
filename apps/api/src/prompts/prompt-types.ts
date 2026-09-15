/** Raw shape of one prompt YAML file, before structural validation. */
export interface RawPromptVariable {
  name: string;
  required: boolean;
}

export interface RawPromptExample {
  user: string;
  output: unknown;
}

export interface RawPromptDefinition {
  id: string;
  version: string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  response_schema: Record<string, unknown>;
  system: string;
  user_template: string;
  variables: RawPromptVariable[];
  examples?: RawPromptExample[];
  banned_phrases?: string[];
  constraints?: string[];
}

export interface PromptVariable {
  name: string;
  required: boolean;
}

export interface PromptExample {
  user: string;
  output: unknown;
}

/** A prompt file that has passed every structural check in prompt-file-loader.ts. */
export interface LoadedPrompt {
  id: string;
  version: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseSchema: Record<string, unknown>;
  system: string;
  userTemplate: string;
  variables: PromptVariable[];
  examples: PromptExample[];
  bannedPhrases: string[];
  constraints: string[];
  filePath: string;
}

/**
 * The caller-visible unit of work: `ok` on the first try, the two
 * schema-retry results, and three failures that are never retried by this
 * library — timeout, an empty/blocked response, and any other provider error.
 */
export type ExecutionOutcome =
  | 'ok'
  | 'validation_failed_retried_ok'
  | 'validation_failed_hard_error'
  | 'timeout'
  | 'empty_response'
  | 'provider_error';

export interface PromptExecutionResult {
  data: unknown;
  promptId: string;
  promptVersion: string;
  model: string;
  retried: boolean;
}
