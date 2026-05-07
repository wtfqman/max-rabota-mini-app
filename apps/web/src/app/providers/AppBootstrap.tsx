import { type ReactNode, useEffect } from 'react';
import { FullscreenState } from '../../shared/ui/FullscreenState.js';
import { useAppStore } from '../store/app-store.js';

interface AppBootstrapProps {
  children: ReactNode;
}

export function AppBootstrap({ children }: AppBootstrapProps) {
  const initStatus = useAppStore((state) => state.initStatus);
  const initError = useAppStore((state) => state.initError);
  const initialize = useAppStore((state) => state.initialize);
  const resetError = useAppStore((state) => state.resetError);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (initStatus === 'idle' || initStatus === 'loading') {
    return <FullscreenState title="Открываем Rabst24" description="Подготавливаем вакансии, объявления и ваш профиль." />;
  }

  if (initStatus === 'error') {
    return (
      <FullscreenState
        title="Не удалось открыть приложение"
        description={initError ?? 'Откройте mini app заново из MAX и попробуйте ещё раз.'}
        actionLabel="Попробовать снова"
        onAction={resetError}
      />
    );
  }

  return children;
}
