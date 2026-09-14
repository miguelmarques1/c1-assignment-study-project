import type { PrismaClient } from '@prisma/client';

import type { CredentialCryptoService } from '../credentials/credential-crypto.service';

export class MasterKeyMismatchError extends Error {
  constructor(public readonly storedCount: number) {
    super('Stored credentials cannot be decrypted with the current BYOK_MASTER_KEY.');
    this.name = 'MasterKeyMismatchError';
  }
}

export interface DecryptabilityResult {
  checked: number;
  invalidated: number;
}

export interface DecryptabilityOptions {
  prisma: PrismaClient;
  crypto: CredentialCryptoService;
  log?: (message: string) => void;
}

/**
 * Probes every stored credential at boot.
 *
 * The PRD demands opposite responses to two failures without saying how to tell
 * them apart, so the discriminator is how many rows fail:
 *
 *   every row fails  → the master key changed. Nothing here is recoverable and
 *                      every pipeline would break confusingly, so stop the boot.
 *   some rows fail   → those rows are corrupt. Mark them invalid and start; one
 *                      bad row must not take the whole platform down.
 */
export async function verifyCredentialDecryptability(
  options: DecryptabilityOptions,
): Promise<DecryptabilityResult> {
  const { prisma, crypto, log = () => undefined } = options;

  const rows = await prisma.userCredential.findMany({
    select: { id: true, ciphertext: true, iv: true, authTag: true, status: true },
  });

  if (rows.length === 0) {
    return { checked: 0, invalidated: 0 };
  }

  const unreadable = rows.filter(
    (row) =>
      !crypto.canDecrypt({
        ciphertext: Buffer.from(row.ciphertext),
        iv: Buffer.from(row.iv),
        authTag: Buffer.from(row.authTag),
      }),
  );

  if (unreadable.length === rows.length) {
    throw new MasterKeyMismatchError(rows.length);
  }

  const toInvalidate = unreadable.filter((row) => row.status !== 'invalid');

  if (toInvalidate.length > 0) {
    await prisma.userCredential.updateMany({
      where: { id: { in: toInvalidate.map((row) => row.id) } },
      data: { status: 'invalid' },
    });
    log(
      `${toInvalidate.length} of ${rows.length} stored credentials could not be decrypted and were marked invalid.`,
    );
  }

  return { checked: rows.length, invalidated: unreadable.length };
}
