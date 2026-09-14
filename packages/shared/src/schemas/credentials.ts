import { z } from 'zod';

export const credentialProviderSchema = z.enum(['gemini', 'azure_speech']);
export type CredentialProvider = z.infer<typeof credentialProviderSchema>;

/**
 * `missing` is not a stored value — it is the absence of a row. The read model
 * surfaces it so the interface has one vocabulary instead of special-casing
 * absence everywhere.
 */
export const credentialStatusSchema = z.enum(['valid', 'invalid', 'unverified', 'missing']);
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;

export const providerLabels: Record<CredentialProvider, string> = {
  gemini: 'Gemini',
  azure_speech: 'Azure Speech',
};

/**
 * Region is accepted by shape rather than checked against a list of known Azure
 * regions: a hard-coded list goes stale silently whenever Azure adds one. The
 * token issuance call is the real validator.
 */
export const azureRegionField = z
  .string()
  .trim()
  .min(2, { error: 'Region is required for Azure Speech.' })
  .max(40, { error: 'Region must be at most 40 characters.' })
  .regex(/^[a-z][a-z0-9]*$/, {
    error: 'Region must be lowercase letters and digits, like brazilsouth.',
  });

export const apiKeyField = z
  .string()
  .trim()
  .min(20, { error: 'That key looks too short.' })
  .max(400, { error: 'That key looks too long.' });

export const saveCredentialSchema = z.object({
  key: apiKeyField,
  region: azureRegionField.nullish(),
});

export type SaveCredentialInput = z.infer<typeof saveCredentialSchema>;

/** Everything a client is ever allowed to know about a stored credential. */
export const maskedCredentialSchema = z.object({
  provider: credentialProviderSchema,
  status: credentialStatusSchema,
  /** `null` when missing; otherwise a mask plus the last four characters. */
  maskedKey: z.string().nullable(),
  region: z.string().nullable(),
  lastValidatedAt: z.iso.datetime().nullable(),
});

export type MaskedCredential = z.infer<typeof maskedCredentialSchema>;

export const maskedCredentialListSchema = z.array(maskedCredentialSchema);
