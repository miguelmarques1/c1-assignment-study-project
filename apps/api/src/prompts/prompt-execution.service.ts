import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Injectable } from '@nestjs/common';

import { AppError } from '../common/app-error';
import { CredentialExecutorService } from '../credentials/credential-executor.service';
import { withTimeout } from '../credentials/validation/validation-outcome';
import { PromptExecutionTelemetryService } from './prompt-execution-telemetry.service';
import { PromptRegistryService } from './prompt-registry.service';
import type { ExecutionOutcome, LoadedPrompt, PromptExecutionResult } from './prompt-types';
import { buildRetryMessage, renderUserMessage } from './template-renderer';
import { validateResponse } from './response-validator';

/**
 * PRD-mandated budget. A fixed constant, not configuration — unlike
 * LESSON_MAX_PARTICIPANTS (F05), the PRD never calls this "configuration".
 */
const EXECUTION_TIMEOUT_MS = 90_000;
const TIMEOUT_MESSAGE = `Probe timed out after ${EXECUTION_TIMEOUT_MS}ms`;

/** Internal signals only — callers never see these classes, only AppError. */
class TimeoutSignal extends Error {}
class EmptyResponseSignal extends Error {}

interface ModelAttempt {
  rawText: string;
  data: unknown;
  parseErrors: string[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

@Injectable()
export class PromptExecutionService {
  constructor(
    private readonly registry: PromptRegistryService,
    private readonly credentials: CredentialExecutorService,
    private readonly telemetry: PromptExecutionTelemetryService,
  ) {}

  async execute(
    userId: string,
    promptId: string,
    variables: Record<string, string>,
  ): Promise<PromptExecutionResult> {
    const prompt = this.registry.get(promptId);
    const message = renderUserMessage(prompt, variables);

    const startedAt = Date.now();
    let attempted = false;
    let outcome: ExecutionOutcome | undefined;
    let retried = false;
    let inputTokens = 0;
    let outputTokens = 0;
    let rawResponseForTelemetry: string | null = null;

    try {
      const data = await this.credentials.withKey(userId, 'gemini', `F04_${promptId}`, async ({ key }) => {
        attempted = true;
        const ai = new GoogleGenAI({ apiKey: key });

        const first = await this.callModel(ai, prompt, message);
        inputTokens += first.inputTokens ?? 0;
        outputTokens += first.outputTokens ?? 0;

        const firstValidation = first.parseErrors
          ? { valid: false, errors: first.parseErrors }
          : validateResponse(prompt, first.data);

        if (firstValidation.valid) {
          outcome = 'ok';
          return first.data;
        }

        retried = true;
        const retryMessage = buildRetryMessage(message, firstValidation.errors);
        const second = await this.callModel(ai, prompt, retryMessage);
        inputTokens += second.inputTokens ?? 0;
        outputTokens += second.outputTokens ?? 0;

        const secondValidation = second.parseErrors
          ? { valid: false, errors: second.parseErrors }
          : validateResponse(prompt, second.data);

        if (secondValidation.valid) {
          outcome = 'validation_failed_retried_ok';
          return second.data;
        }

        outcome = 'validation_failed_hard_error';
        rawResponseForTelemetry = second.rawText;
        throw AppError.promptExecutionFailed(second.rawText, secondValidation.errors);
      });

      await this.telemetry.record({
        userId,
        promptId: prompt.id,
        promptVersion: prompt.version,
        model: prompt.model,
        temperature: prompt.temperature,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
        outcome: outcome ?? 'ok',
        rawResponse: null,
      });

      return { data, promptId: prompt.id, promptVersion: prompt.version, model: prompt.model, retried };
    } catch (error) {
      if (!attempted) {
        // withKey blocked before our callback ever ran (missing/invalid
        // credential) — nothing prompt-related was attempted, so there is
        // nothing meaningful to record here. withKey already wrote its own
        // credential_usage audit row for this.
        throw error;
      }

      let toThrow = error;
      let finalOutcome: ExecutionOutcome;

      if (error instanceof TimeoutSignal) {
        finalOutcome = 'timeout';
        toThrow = AppError.promptTimeout(promptId);
      } else if (error instanceof EmptyResponseSignal) {
        finalOutcome = 'empty_response';
        toThrow = AppError.promptEmptyResponse(promptId);
      } else if (outcome === 'validation_failed_hard_error') {
        finalOutcome = outcome;
      } else {
        finalOutcome = 'provider_error';
      }

      await this.telemetry.record({
        userId,
        promptId: prompt.id,
        promptVersion: prompt.version,
        model: prompt.model,
        temperature: prompt.temperature,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        latencyMs: Date.now() - startedAt,
        outcome: finalOutcome,
        rawResponse: rawResponseForTelemetry,
      });

      throw toThrow;
    }
  }

  /**
   * `thinkingLevel: 'LOW'` is a code-level default applied to every call, not
   * a per-prompt YAML field — the interview was explicit that the envelope
   * stays exactly at the PRD's field list. Discovered necessary by the
   * Stage 1 spike: gemini-3.6-flash is a thinking model whose reasoning
   * tokens count against the same generation budget as visible output.
   */
  private async callModel(
    ai: GoogleGenAI,
    prompt: LoadedPrompt,
    message: string,
  ): Promise<ModelAttempt> {
    let response;
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: prompt.model,
          contents: message,
          config: {
            systemInstruction: prompt.system,
            responseMimeType: 'application/json',
            responseJsonSchema: prompt.responseSchema,
            temperature: prompt.temperature,
            maxOutputTokens: prompt.maxOutputTokens,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        EXECUTION_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof Error && error.message === TIMEOUT_MESSAGE) {
        throw new TimeoutSignal(error.message);
      }
      throw error;
    }

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? null;
    const outputTokens = usage
      ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
      : null;

    const text = response.text;
    if (!text) {
      throw new EmptyResponseSignal('Model returned no usable candidate.');
    }

    try {
      return { rawText: text, data: JSON.parse(text) as unknown, parseErrors: null, inputTokens, outputTokens };
    } catch {
      return {
        rawText: text,
        data: undefined,
        parseErrors: ['response was not valid JSON'],
        inputTokens,
        outputTokens,
      };
    }
  }
}
