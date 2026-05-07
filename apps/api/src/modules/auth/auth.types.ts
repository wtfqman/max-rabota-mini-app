export type AuthPlatform = 'ios' | 'android' | 'web' | 'desktop';

export interface VerifyMaxLaunchDto {
  initData: string;
  platform?: AuthPlatform;
}

export interface MaxInitDataUser {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  language_code?: string | null;
  photo_url?: string | null;
}

export interface ValidatedMaxInitData {
  queryId?: string;
  authDate: Date;
  startParam?: string;
  user: MaxInitDataUser;
}

export interface AuthSessionPayload {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
}

export interface AuthProfilePayload {
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

export interface VerifyMaxLaunchPayload {
  session: AuthSessionPayload;
  user: {
    id: string;
    maxUsername: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    role: string;
    status: string;
    createdAt: string;
  };
  profile: AuthProfilePayload | null;
  launch: AuthLaunchPayload;
}
