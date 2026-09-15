import { Global, Module } from '@nestjs/common';

import { PromptExecutionTelemetryService } from './prompt-execution-telemetry.service';
import { PromptExecutionService } from './prompt-execution.service';
import { PromptRegistryService } from './prompt-registry.service';

/**
 * @Global() for the same reason CredentialsModule is: five later feature
 * modules (F06, F11, F14, F15, F17) need PromptRegistryService and
 * PromptExecutionService without each importing this module explicitly.
 */
@Global()
@Module({
  providers: [PromptRegistryService, PromptExecutionService, PromptExecutionTelemetryService],
  exports: [PromptRegistryService, PromptExecutionService],
})
export class PromptsModule {}
