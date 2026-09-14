import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class MigrationFailedError extends Error {
  constructor(public readonly output: string) {
    super(`Migration failed — refusing to start.\n${output}`);
    this.name = 'MigrationFailedError';
  }
}

export interface MigrationOptions {
  databaseUrl: string;
  cwd?: string;
  log?: (message: string) => void;
}

/**
 * Applies pending migrations before the server accepts traffic. Migrations are
 * the only mechanism for schema change, so a failure here has to stop the boot
 * rather than let the API serve requests against a stale schema.
 *
 * The Prisma CLI is resolved through the package manager's bin directory, which
 * is on PATH whenever the API is started as an npm script. Arguments are fixed
 * literals, so the shell is only doing PATH lookup.
 */
export async function runMigrations(options: MigrationOptions): Promise<void> {
  const {
    databaseUrl,
    cwd = process.cwd(),
    // Boot-time modules run before Nest's logger exists, so stdout is the only
    // channel available here.
    // eslint-disable-next-line no-console
    log = (m: string) => console.log(m),
  } = options;

  log('Applying database migrations…');

  try {
    const { stdout } = await execFileAsync('prisma', ['migrate', 'deploy'], {
      cwd,
      shell: true,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
    });
    const summary = stdout.trim().split('\n').at(-1) ?? 'migrations applied';
    log(`Migrations up to date — ${summary}`);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? '';
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const message = error instanceof Error ? error.message : String(error);
    throw new MigrationFailedError([stdout, stderr, message].filter(Boolean).join('\n').trim());
  }
}
