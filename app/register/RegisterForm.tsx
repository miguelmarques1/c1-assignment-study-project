"use client";

import { useActionState } from "react";
import type { RegisterState } from "@/app/_lib/auth/register";

type RegisterAction = (
  prev: RegisterState | undefined,
  formData: FormData,
) => Promise<RegisterState>;

const INITIAL_STATE: RegisterState = { ok: false };

const labelClass = "text-sm font-medium text-foreground";
const inputClass =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const errorClass = "text-xs font-medium text-red-600";
const inputErrorClass = "border-red-500 focus-visible:ring-red-500";

export function RegisterForm({ action }: { action: RegisterAction }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const errors = state.errors ?? {};
  const formError = errors._form?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {formError}
        </div>
      ) : null}
      <Field
        id="name"
        label="Full name"
        type="text"
        autoComplete="name"
        error={errors.name?.[0]}
        required
      />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.[0]}
        required
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.[0]}
        hint="At least 8 characters, with a letter and a number."
        required
      />
      <Field
        id="passwordConfirmation"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.[0]}
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );

  function Field({
    id,
    label,
    type,
    autoComplete,
    error,
    hint,
    required,
  }: {
    id: string;
    label: string;
    type: string;
    autoComplete?: string;
    error?: string;
    hint?: string;
    required?: boolean;
  }) {
    const errorId = error ? `${id}-error` : undefined;
    const hintId = hint ? `${id}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${error ? inputErrorClass : ""}`.trim()}
        />
        {hint && !error ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className={errorClass}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }
}
