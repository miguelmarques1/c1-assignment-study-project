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
    <main className="centered">
      <div style={{ width: '100%', maxWidth: '24rem' }}>
        {params.expired ? (
          <p className="banner" role="status">
            Your session expired. Please sign in again.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
