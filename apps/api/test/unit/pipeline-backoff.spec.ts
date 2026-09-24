import { describe, expect, it } from 'vitest';

import { retryDelayFor, type PipelineStageHandler } from '../../src/pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../../src/pipeline/pipeline-stage.registry';
import { TRANSCRIPTION_RETRY_POLICY } from '../../src/transcription/transcription.constants';

function handler(stage: PipelineStageHandler['stage'], delaysMs: number[]): PipelineStageHandler {
  return { stage, provider: null, retryPolicy: { attempts: delaysMs.length + 1, delaysMs }, run: async () => undefined };
}

describe('pipeline retry policy', () => {
  it('transcription_backoff_is_30s_2m_8m', () => {
    expect(retryDelayFor(TRANSCRIPTION_RETRY_POLICY, 1)).toBe(30_000);
    expect(retryDelayFor(TRANSCRIPTION_RETRY_POLICY, 2)).toBe(120_000);
    expect(retryDelayFor(TRANSCRIPTION_RETRY_POLICY, 3)).toBe(480_000);
  });

  it('transcription_allows_three_retries', () => {
    expect(TRANSCRIPTION_RETRY_POLICY.attempts).toBe(4);
    expect(retryDelayFor(TRANSCRIPTION_RETRY_POLICY, 4)).toBeNull();
  });

  it('the_backoff_reads_the_policy_of_the_jobs_stage', () => {
    const registry = new PipelineStageRegistry({});
    const transcription = handler('transcription', [30_000, 120_000, 480_000]);
    const selection = handler('excerpt_selection', [60_000, 300_000, 900_000]);
    registry.register(transcription);
    registry.register(selection);

    expect(retryDelayFor(registry.retryPolicy(transcription), 1)).toBe(30_000);
    expect(retryDelayFor(registry.retryPolicy(selection), 1)).toBe(60_000);
  });

  it('an_override_replaces_only_its_own_stage', () => {
    const registry = new PipelineStageRegistry({ transcription: { attempts: 4, delaysMs: [5, 5, 5] } });
    const transcription = handler('transcription', [30_000, 120_000, 480_000]);
    const selection = handler('excerpt_selection', [60_000]);

    expect(retryDelayFor(registry.retryPolicy(transcription), 2)).toBe(5);
    expect(retryDelayFor(registry.retryPolicy(selection), 1)).toBe(60_000);
  });

  it('refuses_a_second_handler_for_the_same_stage', () => {
    const registry = new PipelineStageRegistry({});
    registry.register(handler('transcription', [1]));

    expect(() => registry.register(handler('transcription', [1]))).toThrow(/already registered/);
  });
});
