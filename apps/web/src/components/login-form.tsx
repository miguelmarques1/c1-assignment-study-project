'use client';

import { ERROR_CODES, loginSchema } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ApiRequestError, apiFetch } from '@/lib/api-client';

interface LockoutState {
  secondsLeft: number;
}

export function LoginForm() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockout, setLockout] = useState<LockoutState | null>(null);

  // Counts the lockout down in place so the user can see when the form will
  // accept input again, instead of guessing.
  useEffect(() => {
    if (!lockout) {
      return;
    }
    if (lockout.secondsLeft <= 0) {
      setLockout(null);
      setError(null);
      return;
    }

    const timer = setTimeout(
      () => setLockout({ secondsLeft: lockout.secondsLeft - 1 }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [lockout]);

  // The password field is disabled while the request is in flight, and a
  // disabled input cannot take focus. Refocusing has to wait until submission
  // has settled, otherwise the user has to click back into the field after
  // every failed attempt.
  useEffect(() => {
    if (error && !submitting && !lockout) {
      passwordRef.current?.focus();
    }
  }, [error, submitting, lockout]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the values you entered.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);

        if (caught.code === ERROR_CODES.AUTH_LOCKED_OUT) {
          const details = caught.details as { retryAfterSeconds?: number } | null;
          setLockout({ secondsLeft: details?.retryAfterSeconds ?? 900 });
        }
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }

      // Clear the password so a retry starts from the field that actually
      // needs changing; the effect above restores focus once it is enabled.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  const locked = lockout !== null;
  const minutes = lockout ? Math.floor(lockout.secondsLeft / 60) : 0;
  const seconds = lockout ? lockout.secondsLeft % 60 : 0;

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h1>English Quest</h1>
      <p className="subtitle">Sign in to continue.</p>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting || locked}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          ref={passwordRef}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting || locked}
          required
        />
      </div>

      <button className="primary" type="submit" disabled={submitting || locked}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      {error ? (
        <p className="error" role="alert">
          {error}
          {locked ? ` (${minutes}:${String(seconds).padStart(2, '0')})` : null}
        </p>
      ) : null}
    </form>
  );
}
