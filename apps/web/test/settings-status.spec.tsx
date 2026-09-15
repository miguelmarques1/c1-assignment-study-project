import type { MaskedCredential } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { aggregateCredentialStatus, SettingsScreen } from '@/components/settings-screen';

function credential(overrides: Partial<MaskedCredential> = {}): MaskedCredential {
  return {
    provider: 'gemini',
    status: 'valid',
    maskedKey: '••••f4Qa',
    region: null,
    lastValidatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('aggregateCredentialStatus', () => {
  it('both_valid_reads_as_ready', () => {
    const status = aggregateCredentialStatus([
      credential({ provider: 'gemini', status: 'valid' }),
      credential({ provider: 'azure_speech', status: 'valid' }),
    ]);
    expect(status).toBe('ready');
  });

  it('a_missing_provider_reads_as_attention', () => {
    const status = aggregateCredentialStatus([
      credential({ provider: 'gemini', status: 'valid' }),
      credential({ provider: 'azure_speech', status: 'missing', maskedKey: null }),
    ]);
    expect(status).toBe('attention');
  });

  it('an_invalid_or_unverified_provider_reads_as_attention', () => {
    for (const status of ['invalid', 'unverified'] as const) {
      const result = aggregateCredentialStatus([
        credential({ provider: 'gemini', status }),
        credential({ provider: 'azure_speech', status: 'valid' }),
      ]);
      expect(result).toBe('attention');
    }
  });

  it('null_while_not_yet_loaded', () => {
    expect(aggregateCredentialStatus(null)).toBeNull();
  });
});

describe('SettingsScreen status chip', () => {
  afterEach(() => cleanup());

  it('the_chip_does_not_name_the_failing_provider', () => {
    render(
      <SettingsScreen
        initialCredentials={[
          credential({ provider: 'gemini', status: 'missing', maskedKey: null }),
          credential({ provider: 'azure_speech', status: 'valid' }),
        ]}
      />,
    );

    // Scoped to the chip itself — "Gemini" legitimately appears elsewhere on
    // the page, as the failing card's own provider heading.
    const chip = screen.getByText('Keys need attention');
    expect(chip.textContent).not.toMatch(/gemini/i);
  });

  it('renders_ready_when_both_are_valid', () => {
    render(
      <SettingsScreen
        initialCredentials={[
          credential({ provider: 'gemini', status: 'valid' }),
          credential({ provider: 'azure_speech', status: 'valid' }),
        ]}
      />,
    );

    expect(screen.getByText('Environment ready')).toBeInTheDocument();
  });

  it('the_help_card_is_static_with_no_link', () => {
    render(
      <SettingsScreen
        initialCredentials={[
          credential({ provider: 'gemini', status: 'valid' }),
          credential({ provider: 'azure_speech', status: 'valid' }),
        ]}
      />,
    );

    expect(screen.getByText('Need help getting your keys?')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
