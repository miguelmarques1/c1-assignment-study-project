import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Pre-computed bcrypt hash used during the login flow when the submitted email
// does not exist, so the response time matches a real compare and does not leak
// user existence via timing.
export const DUMMY_HASH =
  "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.8a7hF3cWpOqQlVv5b8N0RQ3sZ9m2";
