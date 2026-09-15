import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { ExecutionOutcome } from './prompt-types';

const RAW_RESPONSE_MAX_CHARS = 10_000;

export interface RecordExecutionInput {
  userId: string;
  promptId: string;
  promptVersion: string;
  model: string;
  temperature: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  outcome: ExecutionOutcome;
  rawResponse: string | null;
}

/**
 * Append-only telemetry, one row per PromptExecutionService.execute() call.
 * Writes here must never be able to fail the execution they are auditing —
 * same non-blocking contract as CredentialUsageService.
 */
@Injectable()
export class PromptExecutionTelemetryService {
  private readonly logger = new Logger(PromptExecutionTelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordExecutionInput): Promise<void> {
    try {
      await this.prisma.promptExecution.create({
        data: {
          userId: input.userId,
          promptId: input.promptId,
          promptVersion: input.promptVersion,
          model: input.model,
          temperature: input.temperature,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          latencyMs: input.latencyMs,
          outcome: input.outcome,
          rawResponse: input.rawResponse?.slice(0, RAW_RESPONSE_MAX_CHARS) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record prompt execution for ${input.promptId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
