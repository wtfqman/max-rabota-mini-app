import type { User } from '@rabst24/db';

export function serializeUser(user: User) {
  return {
    id: user.id,
    maxUsername: user.maxUsername,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    role: user.role.toLowerCase(),
    status: user.status.toLowerCase(),
    createdAt: user.createdAt.toISOString()
  };
}
