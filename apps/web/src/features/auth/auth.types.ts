export type AuthPlatform = 'ios' | 'android' | 'web' | 'desktop';
export type AuthRole = 'user' | 'moderator' | 'admin';
export type AuthStatus = 'active' | 'blocked' | 'deleted';

export interface VerifyMaxLaunchRequest {
  initData: string;
  platform?: AuthPlatform;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
}

export interface AuthUser {
  id: string;
  maxUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  role: AuthRole;
  status: AuthStatus;
  createdAt: string;
}

export interface AuthProfile {
  id: string;
  city: string | null;
  districtText: string | null;
  about: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthLaunchPayload {
  provider: 'max';
  queryId?: string;
  startParam?: string;
  platform?: AuthPlatform;
  authDate: string;
}

export interface VerifyMaxLaunchResponse {
  session: AuthSession;
  user: AuthUser;
  profile: AuthProfile | null;
  launch: AuthLaunchPayload;
}
