import { create } from 'zustand';
import type {
  AuthPlatform,
  AuthProfile,
  AuthRole,
  AuthSession,
  AuthStatus
} from '../../features/auth/auth.types.js';
import { apiClient } from '../../shared/api/client.js';
import { setApiAccessToken } from '../../shared/api/http.js';
import { getUserFacingError } from '../../shared/api/user-facing.js';
import { appEnv } from '../../shared/config/app-env.js';
import { getLaunchContext, notifyMaxAppReady } from '../../shared/max/max-bridge.js';

export type AppInitStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  initialize: async () => {
    if (get().initStatus === 'loading' || get().initStatus === 'ready') {
      return;
    }

    const launchContext = getLaunchContext();
    notifyMaxAppReady();

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
      let authResponse = null;

      if (launchContext.initData) {
        authResponse = await apiClient.verifyMaxLaunch({
          initData: launchContext.initData,
          platform: launchContext.platform
        });
      } else if (appEnv.devAuthEnabled) {
        authResponse = await apiClient.createDevSession();
      }

      if (authResponse) {
        const auth = authResponse.data;

        setApiAccessToken(auth.session.accessToken);
        set({
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

      set({ initStatus: 'ready' });
    } catch (error) {
      setApiAccessToken(null);
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
