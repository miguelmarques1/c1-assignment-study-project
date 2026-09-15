import type { PromptRegistryService } from '../prompts/prompt-registry.service';

export interface LoadPromptsOptions {
  registry: PromptRegistryService;
  log?: (message: string) => void;
}

/**
 * Thin boot-sequence wrapper around PromptRegistryService.loadAll(), mirroring
 * verify-credential-decryptability.ts's shape. The registry must be a real
 * Nest provider (later features inject it), so this step runs after
 * NestFactory.create, not before it like the pre-Nest boot steps.
 */
export async function loadPrompts(options: LoadPromptsOptions): Promise<{ count: number }> {
  const { registry, log = () => undefined } = options;
  return registry.loadAll(undefined, log);
}
