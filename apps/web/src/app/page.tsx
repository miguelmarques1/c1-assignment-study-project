import { redirect } from 'next/navigation';

/** The root has no content of its own; the middleware decides where you land. */
export default function RootPage() {
  redirect('/dashboard');
}
