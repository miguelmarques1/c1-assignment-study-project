import { describe, it, expect } from "vitest";
import { PIPELINE_ERROR_CODES, PipelineError, STAGE_ENTRY_STATUS } from "../errors";

describe("PipelineError", () => {
  it("constructs with code, message, and retriable flag", () => {
    const err = new PipelineError("PIPE_TRANSCRIBE_API", "boom", true);
    expect(err.code).toBe("PIPE_TRANSCRIBE_API");
    expect(err.message).toBe("boom");
    expect(err.retriable).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe("PipelineError");
  });

  it("exposes the full code taxonomy", () => {
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_VALIDATE_UNREADABLE");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_VALIDATE_TOO_LONG");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_TRANSCRIBE_API");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_SUMMARIZE_API");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_SUMMARIZE_MALFORMED");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_TIMEOUT");
    expect(PIPELINE_ERROR_CODES).toContain("PIPE_INTERNAL");
  });

  it("maps stages to their entry statuses", () => {
    expect(STAGE_ENTRY_STATUS.validate).toBe("validating");
    expect(STAGE_ENTRY_STATUS.transcribe).toBe("transcribing");
    expect(STAGE_ENTRY_STATUS.summarize).toBe("summarizing");
  });
});
