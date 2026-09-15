import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { AppError } from '../common/app-error';
import { loadPromptFile } from './prompt-file-loader';
import type { LoadedPrompt } from './prompt-types';

/** Thrown at boot when any prompt file fails any structural check. */
export class PromptLibraryValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid prompt library:\n  ${issues.join('\n  ')}`);
    this.name = 'PromptLibraryValidationError';
  }
}

/**
 * Distinguishes "the registry was queried before boot finished loading it"
 * from "this prompt id doesn't exist" — the two point at very different
 * bugs, so they must not share one error.
 */
export class PromptRegistryNotLoadedError extends Error {
  constructor() {
    super('PromptRegistryService.get() was called before loadAll() populated the registry.');
    this.name = 'PromptRegistryNotLoadedError';
  }
}

@Injectable()
export class PromptRegistryService {
  private prompts: Map<string, LoadedPrompt> | undefined;

  /**
   * Loads every `*.yaml` file in `directory`, aggregating every issue across
   * every file into one thrown error rather than stopping at the first bad
   * file — a curator who breaks two files in one edit sees both problems in
   * one boot attempt.
   */
  async loadAll(
    directory: string = join(process.cwd(), 'prompts'),
    log: (message: string) => void = () => undefined,
  ): Promise<{ count: number }> {
    const files = readdirSync(directory).filter((name) => name.endsWith('.yaml'));

    const loaded = new Map<string, LoadedPrompt>();
    const allIssues: string[] = [];

    for (const file of files) {
      const { prompt, issues } = loadPromptFile(join(directory, file));
      if (issues.length > 0) {
        allIssues.push(...issues);
        continue;
      }
      if (prompt) {
        loaded.set(prompt.id, prompt);
      }
    }

    if (allIssues.length > 0) {
      throw new PromptLibraryValidationError(allIssues);
    }

    for (const prompt of loaded.values()) {
      log(`Loaded prompt ${prompt.id} v${prompt.version} (model ${prompt.model}, schema OK)`);
    }

    this.prompts = loaded;
    return { count: loaded.size };
  }

  get(promptId: string): LoadedPrompt {
    if (!this.prompts) {
      throw new PromptRegistryNotLoadedError();
    }
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      throw AppError.promptNotFound(promptId);
    }
    return prompt;
  }
}
