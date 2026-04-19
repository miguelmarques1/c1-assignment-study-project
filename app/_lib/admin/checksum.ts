export type ChecksumInput = {
  isSuspended: boolean;
  updatedAt: Date;
};

export function userActionChecksum(user: ChecksumInput): string {
  return `${user.isSuspended}:${user.updatedAt.getTime()}`;
}
