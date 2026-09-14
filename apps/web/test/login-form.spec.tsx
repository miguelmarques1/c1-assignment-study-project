import { ERROR_CODES } from '@english-quest/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/login-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('submits_valid_credentials', async () => {
    const fetchMock = mockFetch(200, {
      data: { id: 'id', email: 'user@example.com', displayName: 'User' },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), '  User@Example.COM ');
    await userEvent.type(screen.getByLabelText('Password'), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // The shared schema normalizes before sending, so the API never has to
    // guess whether two spellings are the same account.
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'user@example.com',
      password: 'a good password',
    });
    expect(init.credentials).toBe('include');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows_generic_error_and_clears_password', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, {
        error: {
          code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
          message: 'Incorrect email or password.',
          details: null,
        },
      }),
    );

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.'),
    );

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.value).toBe('');
    expect(passwordInput).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows_lockout_with_countdown', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(429, {
        error: {
          code: ERROR_CODES.AUTH_LOCKED_OUT,
          message: 'Too many attempts. Try again in 15 minutes.',
          details: { retryAfterSeconds: 900 },
        },
      }),
    );

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts.'),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/1[45]:\d{2}/);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('rejects_invalid_email_before_calling_the_api', async () => {
    const fetchMock = mockFetch(200, { data: {} });
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has_no_register_or_reset_links', () => {
    render(<LoginForm />);

    expect(screen.queryByText(/create account/i)).toBeNull();
    expect(screen.queryByText(/forgot password/i)).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
