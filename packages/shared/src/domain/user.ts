export const USER_ROLES = ['user', 'moderator', 'admin'] as const;
export const USER_STATUSES = ['active', 'blocked', 'deleted'] as const;

export type UserRoleCode = (typeof USER_ROLES)[number];
export type UserStatusCode = (typeof USER_STATUSES)[number];
