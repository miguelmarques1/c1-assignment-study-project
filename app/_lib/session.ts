// F01 stub: this module will be replaced by F02 (Authentication System).
// Until then, `getSession()` always resolves to `null` so F01's landing page
// can call it server-side without coupling to a specific session store.

export type Session = {
  userId: string;
  email: string;
};

export async function getSession(): Promise<Session | null> {
  return null;
}
