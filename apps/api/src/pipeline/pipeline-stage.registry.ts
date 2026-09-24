import { Inject, Injectable, Optional } from '@nestjs/common';

import type { QueuedPipelineStage } from './pipeline.constants';
import type { PipelineStageHandler, StageRetryPolicy } from './pipeline-stage.handler';

/**
 * Replaces a stage's retry schedule. Production provides an empty map; the
 * integration suites override it with millisecond delays so a three-retry
 * failure takes a second instead of ten minutes.
 */
export const PIPELINE_RETRY_OVERRIDES = Symbol('PIPELINE_RETRY_OVERRIDES');
export type PipelineRetryOverrides = Partial<Record<QueuedPipelineStage, StageRetryPolicy>>;

/**
 * Where stage handlers announce themselves at module init. A stage with no
 * registered handler simply waits at `queued` — that is how F08 leaves
 * branches at `excerpt_selection` for F09 to pick up without either feature
 * editing the other.
 */
@Injectable()
export class PipelineStageRegistry {
  private readonly handlers = new Map<QueuedPipelineStage, PipelineStageHandler>();

  constructor(
    @Optional() @Inject(PIPELINE_RETRY_OVERRIDES) private readonly overrides: PipelineRetryOverrides = {},
  ) {}

  register(handler: PipelineStageHandler): void {
    if (this.handlers.has(handler.stage)) {
      throw new Error(`A handler for the ${handler.stage} stage is already registered.`);
    }
    this.handlers.set(handler.stage, handler);
  }

  get(stage: QueuedPipelineStage): PipelineStageHandler | undefined {
    return this.handlers.get(stage);
  }

  has(stage: string): stage is QueuedPipelineStage {
    return this.handlers.has(stage as QueuedPipelineStage);
  }

  retryPolicy(handler: PipelineStageHandler): StageRetryPolicy {
    return this.overrides[handler.stage] ?? handler.retryPolicy;
  }
}
