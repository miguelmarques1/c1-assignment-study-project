export const PIPELINE_ERROR_CODES = [
  "PIPE_VALIDATE_UNREADABLE",
  "PIPE_VALIDATE_TOO_LONG",
  "PIPE_TRANSCRIBE_API",
  "PIPE_SUMMARIZE_API",
  "PIPE_SUMMARIZE_MALFORMED",
  "PIPE_TIMEOUT",
  "PIPE_INTERNAL",
] as const;

export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number];

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly retriable: boolean;

  constructor(code: PipelineErrorCode, message: string, retriable: boolean) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.retriable = retriable;
  }
}

export type StageName = "validate" | "transcribe" | "summarize";
export type VideoStatus =
  | "validating"
  | "transcribing"
  | "summarizing"
  | "ready"
  | "failed";

export const STAGE_ENTRY_STATUS: Record<StageName, VideoStatus> = {
  validate: "validating",
  transcribe: "transcribing",
  summarize: "summarizing",
};
