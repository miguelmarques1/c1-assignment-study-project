import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { verifyGenerationPrompts } from '../../boot/verify-generation-prompts';
import { ContentSchemaNotInitializedError } from '../../content/content-schema-guard';
import { CredentialsService } from '../../credentials/credentials.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptRegistryService } from '../../prompts/prompt-registry.service';
import { ContentGenerationService } from '../content-generation.service';
import type { GateFailure } from '../generation.contract';
import { GenerationRulesService } from '../generation-rules.service';
import { renderDryRun, renderHeader, renderSlotLine, renderSummary, type ReportSlot } from './generate-report';
import { GenerationCliModule } from './generation-cli.module';

/**
 * `pnpm content:generate <email> [--max N] [--run-key K] [--dry-run]`: runs
 * one generation batch for a user on their own stored Gemini key, through
 * the same service F15 calls, or plans it without calling the model. For the
 * curator: try a prompt or rules change, then read the result with
 * `content:stats`.
 *
 * Runs from the compiled output (`dist/`), because it needs Nest's
 * dependency injection and `tsx` does not reliably emit decorator metadata
 * (spec A25). In the container the dev server's watch build keeps `dist`
 * current; on the host, run `pnpm build` first.
 */

const USAGE = 'Usage: pnpm content:generate <email> [--max N] [--run-key K] [--dry-run]';
const COMMAND = 'content:generate';

interface Args {
  email: string;
  maxItems: number;
  runKey: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  let email: string | undefined;
  let maxItems = 12;
  let runKey = `cli:${new Date().toISOString()}`;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--') {
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--max' || arg === '--run-key') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} needs a value. ${USAGE}`);
      }
      if (arg === '--max') {
        maxItems = Number(value);
        if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 12) {
          throw new Error(`--max must be an integer from 1 to 12. ${USAGE}`);
        }
      } else {
        runKey = value;
      }
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option "${arg}". ${USAGE}`);
    } else if (email === undefined) {
      email = arg.toLowerCase();
    } else {
      throw new Error(`Only one email may be given. ${USAGE}`);
    }
  }
  if (!email) {
    throw new Error(USAGE);
  }
  return { email, maxItems, runKey, dryRun };
}

async function assertGenerationSchemaExists(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ table: string | null }>>`
    SELECT to_regclass('public.content_generation_runs')::text AS "table"
  `;
  if (!rows[0]?.table) {
    throw new ContentSchemaNotInitializedError(COMMAND);
  }
}

async function reportSlots(prisma: PrismaService, runId: string, slots: ReportSlot[]): Promise<void> {
  const rows = await prisma.contentGenerationSlot.findMany({
    where: { runId },
    include: { attempts: { orderBy: { attempt: 'asc' } }, contentItem: { select: { slug: true } } },
  });
  for (const slot of slots) {
    const row = rows.find((candidate) => candidate.position === slot.position);
    slot.itemSlug = row?.contentItem?.slug ?? null;
    slot.attemptsDetail = (row?.attempts ?? []).map((attempt) => {
      const metrics = (attempt.gateMetrics ?? {}) as { word_count?: number; out_of_frequency_ratio?: number; failures?: GateFailure[] };
      return {
        attempt: attempt.attempt,
        outcome: attempt.outcome,
        failedChecks: attempt.failedChecks,
        failures: metrics.failures ?? [],
        wordCount: metrics.word_count ?? null,
        outOfFrequencyRatio: metrics.out_of_frequency_ratio ?? null,
      };
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // abortOnError off: a boot refusal (no frequency list, invalid rules) reaches the catch below as its own message.
  const app = await NestFactory.createApplicationContext(GenerationCliModule, { logger: ['error'], abortOnError: false });
  try {
    const prisma = app.get(PrismaService);
    await assertGenerationSchemaExists(prisma);

    const registry = app.get(PromptRegistryService);
    await registry.loadAll(undefined, () => undefined);
    verifyGenerationPrompts({ registry, allowedFormats: app.get(GenerationRulesService).current().rules.questions.formats });

    const user = await prisma.user.findUnique({ where: { email: args.email } });
    if (!user) {
      throw new Error(`No user with email ${args.email}.`);
    }
    const service = app.get(ContentGenerationService);

    if (args.dryRun) {
      const planned = await service.previewPlan(user.id, { maxItems: args.maxItems });
      process.stdout.write(`${renderDryRun(args.email, planned).join('\n')}\n`);
      return;
    }

    const gemini = (await app.get(CredentialsService).list(user.id)).find((credential) => credential.provider === 'gemini');
    process.stdout.write(`${renderHeader(args.email, args.maxItems, gemini?.status ?? 'missing', args.runKey)}\n`);
    const result = await service.generateForPlan({
      userId: user.id,
      runKey: args.runKey,
      maxItems: args.maxItems,
      onProgress: (done, total) => {
        process.stdout.write(`  … ${done}/${total} slots settled\n`);
      },
    });
    const slots: ReportSlot[] = result.slots.map((slot) => ({ ...slot, attemptsDetail: [], itemSlug: null }));
    await reportSlots(prisma, result.runId, slots);
    process.stdout.write(`${[...slots.map(renderSlotLine), renderSummary(result)].join('\n')}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
