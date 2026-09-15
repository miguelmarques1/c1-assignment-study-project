import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import Ajv, { type ErrorObject } from 'ajv';
import { parse as parseYaml } from 'yaml';

import { validatePromptEnvelope } from './prompt-envelope.schema';
import type { LoadedPrompt, RawPromptDefinition } from './prompt-types';

export interface LoadFileResult {
  prompt: LoadedPrompt | null;
  issues: string[];
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractPlaceholders(template: string): Set<string> {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name) {
      found.add(name);
    }
  }
  return found;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

/**
 * Parses and structurally validates one prompt file. Never throws — every
 * problem is collected into `issues` so PromptRegistryService can aggregate
 * across every file in the directory into one boot failure, per the
 * specification's decision to report every problem in one attempt.
 */
export function loadPromptFile(filePath: string): LoadFileResult {
  const fileLabel = basename(filePath);
  const issues: string[] = [];

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { prompt: null, issues: [`${fileLabel}: could not parse YAML — ${message}`] };
  }

  const validateEnvelope = validatePromptEnvelope();
  if (!validateEnvelope(raw)) {
    return {
      prompt: null,
      issues: [`${fileLabel}: ${formatAjvErrors(validateEnvelope.errors)}`],
    };
  }

  const def = raw as RawPromptDefinition;

  const expectedFileName = `${def.id}.yaml`;
  if (fileLabel !== expectedFileName) {
    issues.push(
      `${fileLabel}: filename does not match its declared id "${def.id}" (expected "${expectedFileName}")`,
    );
  }

  const ajv = new Ajv({ allErrors: true });
  let responseValidate: ReturnType<Ajv['compile']> | undefined;
  try {
    responseValidate = ajv.compile(def.response_schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`${fileLabel}: response_schema does not compile — ${message}`);
  }

  const declaredNames = new Set(def.variables.map((variable) => variable.name));
  const usedNames = extractPlaceholders(def.user_template);

  for (const name of usedNames) {
    if (!declaredNames.has(name)) {
      issues.push(
        `${fileLabel}: user_template references {{${name}}}, which is not declared in variables`,
      );
    }
  }
  for (const name of declaredNames) {
    if (!usedNames.has(name)) {
      issues.push(`${fileLabel}: variable "${name}" is declared but never used in user_template`);
    }
  }

  if (responseValidate) {
    def.examples?.forEach((example, index) => {
      if (!responseValidate(example.output)) {
        issues.push(
          `${fileLabel}: examples[${index}].output does not satisfy response_schema — ${formatAjvErrors(responseValidate.errors)}`,
        );
      }
    });
  }

  if (issues.length > 0) {
    return { prompt: null, issues };
  }

  const prompt: LoadedPrompt = {
    id: def.id,
    version: def.version,
    model: def.model,
    temperature: def.temperature,
    maxOutputTokens: def.max_output_tokens,
    responseSchema: def.response_schema,
    system: def.system,
    userTemplate: def.user_template,
    variables: def.variables,
    examples: def.examples ?? [],
    bannedPhrases: def.banned_phrases ?? [],
    constraints: def.constraints ?? [],
    filePath,
  };

  return { prompt, issues: [] };
}
