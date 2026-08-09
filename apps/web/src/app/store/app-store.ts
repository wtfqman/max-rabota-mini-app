import { create } from 'zustand';
import { buildDisabledFeatureFlags, type PublicFeatureFlags } from '@rabst24/shared';
import type {
  AuthPlatform,
  AuthProfile,
  AuthRole,
  AuthSession,
  AuthStatus,
  VerifyMaxLaunchResponse
} from '../../features/auth/auth.types.js';
import { apiClient } from '../../shared/api/client.js';
import { setApiAccessToken } from '../../shared/api/http.js';
import { getUserFacingError } from '../../shared/api/user-facing.js';
import { appEnv } from '../../shared/config/app-env.js';
import { getLaunchContext, notifyMaxAppReady } from '../../shared/max/max-bridge.js';

export type AppInitStatus = 'idle' | 'loading' | 'ready' | 'error';

const persistedSessionKey = 'rabst24:auth-session';
const appInitializationTimeoutMs = 15_000;

export interface CurrentUserState {
  id: string | null;
  displayName: string | null;
  role: AuthRole;
  status: AuthStatus | null;
}

export interface LaunchState {
  isInsideMax: boolean;
  platform?: AuthPlatform;
  queryId?: string;
  startParam?: string;
  authDate?: string;
}

interface AppState {
  initStatus: AppInitStatus;
  initError: string | null;
  isInsideMax: boolean;
  accessToken: string | null;
  session: AuthSession | null;
  profile: AuthProfile | null;
  launch: LaunchState;
  user: CurrentUserState;
  features: PublicFeatureFlags;
  initialize: () => Promise<void>;
  resetError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  initStatus: 'idle',
  initError: null,
  isInsideMax: false,
  accessToken: null,
  session: null,
  profile: null,
  launch: {
    isInsideMax: false
  },
  user: {
    id: null,
    displayName: null,
    role: 'user',
    status: null
  },
  features: buildDisabledFeatureFlags(),
  initialize: async () => {
    if (get().initStatus === 'loading' || get().initStatus === 'ready') {
      return;
    }

    const launchContext = getLaunchContext();
    let isActiveInitialization = true;
    const setIfActive = (state: Partial<AppState>) => {
      if (isActiveInitialization) {
        set(state);
      }
    };

    notifyMaxAppReady();

    console.info('[MAX_AUTH]', {
      hasInitData: Boolean(launchContext.initData),
      isInsideMax: launchContext.isInsideMax,
      platform: launchContext.platform
    });

    set({
      initStatus: 'loading',
      initError: null,
      isInsideMax: launchContext.isInsideMax,
      launch: {
        isInsideMax: launchContext.isInsideMax,
        platform: launchContext.platform
      }
    });

    try {
      await withInitializationTimeout(
        (async () => {
          const featuresResponse = await apiClient.getFeatures().catch(() => null);
          if (!isActiveInitialization) {
            return;
          }

          if (featuresResponse) {
            setIfActive({
              features: featuresResponse.data.flags
            });
          }

          let authResponse = null;

          if (launchContext.initData) {
            authResponse = await apiClient.verifyMaxLaunch({
              initData: launchContext.initData,
              platform: launchContext.platform
            });
          } else if (appEnv.devAuthEnabled) {
            authResponse = await apiClient.createDevSession();
          } else {
            const persisted = loadPersistedSession();

            if (persisted) {
              setApiAccessToken(persisted.session.accessToken);
              const profileResponse = await apiClient.getMe();
              if (!isActiveInitialization) {
                return;
              }

              const refreshedProfile = profileResponse.data;

              console.info('[MAX_AUTH]', {
                restoredPersistedSession: true,
                userId: refreshedProfile.id,
                expiresAt: persisted.session.expiresAt
              });
              setIfActive({
                accessToken: persisted.session.accessToken,
                session: persisted.session,
                profile: refreshedProfile.profile,
                user: {
                  id: refreshedProfile.id,
                  displayName: refreshedProfile.displayName,
                  role: refreshedProfile.role,
                  status: refreshedProfile.status
                },
                launch: {
                  isInsideMax: launchContext.isInsideMax,
                  platform: persisted.launch.platform,
                  queryId: persisted.launch.queryId,
                  startParam: persisted.launch.startParam,
                  authDate: persisted.launch.authDate
                }
              });
            }
          }

          if (!isActiveInitialization) {
            return;
          }

          if (authResponse) {
            const auth = authResponse.data;

            setApiAccessToken(auth.session.accessToken);
            savePersistedSession(auth);
            console.info('[MAX_AUTH]', {
              verified: true,
              userId: auth.user.id,
              expiresAt: auth.session.expiresAt
            });
            setIfActive({
              accessToken: auth.session.accessToken,
              session: auth.session,
              profile: auth.profile,
              user: {
                id: auth.user.id,
                displayName: auth.user.displayName,
                role: auth.user.role,
                status: auth.user.status
              },
              launch: {
                isInsideMax: launchContext.isInsideMax,
                platform: auth.launch.platform,
                queryId: auth.launch.queryId,
                startParam: auth.launch.startParam,
                authDate: auth.launch.authDate
              }
            });
          }

          setIfActive({ initStatus: 'ready' });
        })(),
        appInitializationTimeoutMs
      );
    } catch (error) {
      isActiveInitialization = false;
      setApiAccessToken(null);
      clearPersistedSession();
      set({
        initStatus: 'error',
        accessToken: null,
        session: null,
        initError: getUserFacingError(error, 'app_init')
      });
    }
  },
  resetError: () => {
    set({ initError: null, initStatus: 'idle' });
    void get().initialize();
  }
}));

function withInitializationTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId = 0;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('app_init_timeout'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

type PersistedAuth = VerifyMaxLaunchResponse;

function savePersistedSession(auth: PersistedAuth): void {
  try {
    window.localStorage.setItem(persistedSessionKey, JSON.stringify(auth));
  } catch {
    // Session persistence is best-effort; in-memory auth still works.
  }
}

function loadPersistedSession(): PersistedAuth | null {
  try {
    const raw = window.localStorage.getItem(persistedSessionKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedAuth;
    if (!isPersistedAuth(parsed)) {
      clearPersistedSession();
      return null;
    }

    const expiresAt = Date.parse(parsed.session?.expiresAt ?? '');

    if (!parsed.session?.accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearPersistedSession();
      return null;
    }

    return parsed;
  } catch {
    clearPersistedSession();
    return null;
  }
}

function isPersistedAuth(value: unknown): value is PersistedAuth {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<PersistedAuth>;

  return (
    typeof record.session?.accessToken === 'string' &&
    typeof record.session.expiresAt === 'string' &&
    typeof record.user?.id === 'string' &&
    (record.user.role === 'user' || record.user.role === 'moderator' || record.user.role === 'admin') &&
    (record.user.status === 'active' || record.user.status === 'blocked' || record.user.status === 'deleted')
  );
}

function clearPersistedSession(): void {
  try {
    window.localStorage.removeItem(persistedSessionKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}
