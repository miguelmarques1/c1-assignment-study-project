import { ERROR_CODES, type MaskedCredential } from '@english-quest/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CredentialCard } from '@/components/credential-card';

const GEMINI_KEY = 'AIzaSyD-a-very-real-looking-gemini-key-f4Qa';

function credential(overrides: Partial<MaskedCredential> = {}): MaskedCredential {
  return {
    provider: 'gemini',
    status: 'missing',
    maskedKey: null,
    region: null,
    lastValidatedAt: null,
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CredentialCard', () => {
  it('renders_each_status_with_its_badge', () => {
    for (const status of ['valid', 'invalid', 'unverified', 'missing'] as const) {
      cleanup();
      render(
        <CredentialCard
          credential={credential({ status, maskedKey: status === 'missing' ? null : '••••f4Qa' })}
          onChanged={vi.fn()}
          onRemoved={vi.fn()}
        />,
      );
      const expected = {
        valid: 'Valid',
        invalid: 'Invalid',
        unverified: 'Not verified',
        missing: 'Missing',
      }[status];
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  });

  it('shows_the_missing_state_explanation_per_provider', () => {
    render(
      <CredentialCard credential={credential()} onChanged={vi.fn()} onRemoved={vi.fn()} />,
    );
    expect(screen.getByText(/will be transcribed and scored but not analyzed/)).toBeInTheDocument();

    cleanup();
    render(
      <CredentialCard
        credential={credential({ provider: 'azure_speech' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );
    expect(screen.getByText(/cannot be transcribed or scored/)).toBeInTheDocument();
  });

  it('surfaces_the_provider_message_verbatim_on_rejection', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(400, {
        error: {
          code: ERROR_CODES.CREDENTIAL_REJECTED,
          message: 'The provider rejected this key.',
          details: { providerMessage: 'API key not valid. Please pass a valid API key.' },
        },
      }),
    );

    render(<CredentialCard credential={credential()} onChanged={vi.fn()} onRemoved={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    await userEvent.type(screen.getByLabelText('API key'), GEMINI_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Save and validate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'API key not valid. Please pass a valid API key.',
      ),
    );

    // The form stays open so the value can be corrected rather than retyped.
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });

  it('requires_a_region_for_azure_only', async () => {
    render(<CredentialCard credential={credential()} onChanged={vi.fn()} onRemoved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(screen.queryByLabelText('Region')).toBeNull();

    cleanup();
    render(
      <CredentialCard
        credential={credential({ provider: 'azure_speech' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
  });

  it('rejects_an_invalid_region_before_calling_the_api', async () => {
    const fetchMock = mockFetch(200, { data: credential() });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CredentialCard
        credential={credential({ provider: 'azure_speech' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    await userEvent.type(screen.getByLabelText('API key'), GEMINI_KEY);
    await userEvent.type(screen.getByLabelText('Region'), 'Brazil South');
    await userEvent.click(screen.getByRole('button', { name: 'Save and validate' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never_renders_more_than_the_last_four_characters', () => {
    const { container } = render(
      <CredentialCard
        credential={credential({ status: 'valid', maskedKey: '••••f4Qa' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(container.textContent).not.toContain(GEMINI_KEY);
    // The masked key renders as a read-only field's value, not text content.
    expect((screen.getByLabelText('Key') as HTMLInputElement).value).toBe('••••f4Qa');
    // There is no affordance to reveal a stored key anywhere.
    expect(screen.queryByRole('button', { name: /reveal|show/i })).toBeNull();
  });

  it('offers_replace_rather_than_add_once_a_key_exists', () => {
    render(
      <CredentialCard
        credential={credential({ status: 'valid', maskedKey: '••••f4Qa' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Gemini key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeInTheDocument();
  });

  it('the_card_leads_with_its_provider_icon', () => {
    const { container } = render(
      <CredentialCard credential={credential()} onChanged={vi.fn()} onRemoved={vi.fn()} />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('no_copy_control_exists', () => {
    render(
      <CredentialCard
        credential={credential({ status: 'valid', maskedKey: '••••f4Qa' })}
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('deleting_returns_the_card_to_its_empty_state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }));
    const onRemoved = vi.fn();

    render(
      <CredentialCard
        credential={credential({ status: 'valid', maskedKey: '••••f4Qa' })}
        onChanged={vi.fn()}
        onRemoved={onRemoved}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete Gemini key' }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('gemini'));
  });
});
