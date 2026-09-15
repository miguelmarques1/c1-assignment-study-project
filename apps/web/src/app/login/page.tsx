import { LoginForm } from '@/components/login-form';

export const metadata = {
  title: 'Sign in · English Quest',
};

/**
 * There is deliberately no "create account" or "forgot password" affordance:
 * neither endpoint exists in the API, so offering them would be a dead end.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-md">
      <div className="flex w-full max-w-sm flex-col gap-md">
        {params.expired ? (
          <p
            role="status"
            className="rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-body-sm text-on-surface-variant"
          >
            Your session expired. Please sign in again.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
