import { describe, expect, it } from 'vitest';

import { BCRYPT_COST, PasswordService } from '../../src/auth/password.service';

const service = new PasswordService();

describe('PasswordService', () => {
  it('hashes_at_cost_12', async () => {
    const hash = await service.hash('a reasonable password');

    expect(BCRYPT_COST).toBe(12);
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
    expect(hash).toHaveLength(60);
  });

  it('verifies_correct_password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects_wrong_password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify('wrong horse battery staple', hash)).resolves.toBe(false);
  });

  it('produces_a_different_hash_for_the_same_password', async () => {
    const [first, second] = await Promise.all([service.hash('same'), service.hash('same')]);
    expect(first).not.toBe(second);
  });

  it('unknown_email_still_spends_comparison_time', async () => {
    const hash = await service.hash('a reasonable password');

    // Warm up so the first bcrypt call's overhead does not skew the comparison.
    await service.verify('a reasonable password', hash);
    await service.verifyAgainstDummy('a reasonable password');

    const realStart = process.hrtime.bigint();
    await service.verify('a reasonable password', hash);
    const realNs = Number(process.hrtime.bigint() - realStart);

    const dummyStart = process.hrtime.bigint();
    const result = await service.verifyAgainstDummy('a reasonable password');
    const dummyNs = Number(process.hrtime.bigint() - dummyStart);

    expect(result).toBe(false);

    // Both paths run one bcrypt comparison at the same cost factor, so the
    // difference should be noise rather than an order of magnitude.
    const ratio = Math.max(realNs, dummyNs) / Math.min(realNs, dummyNs);
    expect(ratio).toBeLessThan(1.5);
  });
});
