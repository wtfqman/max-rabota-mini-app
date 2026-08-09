import { type ReactNode, useEffect, useState } from 'react';
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
  const [isTakingLong, setIsTakingLong] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (initStatus !== 'idle' && initStatus !== 'loading') {
      setIsTakingLong(false);
      return;
    }

    setIsTakingLong(false);
    const timeoutId = window.setTimeout(() => {
      setIsTakingLong(true);
    }, 12_000);

    return () => window.clearTimeout(timeoutId);
  }, [initStatus]);

  if (initStatus === 'idle' || initStatus === 'loading') {
    if (isTakingLong) {
      return (
        <FullscreenState
          title="Загрузка заняла слишком много времени"
          description="Проверьте соединение или откройте mini app заново из MAX."
          actionLabel="Попробовать снова"
          onAction={resetError}
        />
      );
    }

    return <FullscreenState title="Открываем приложение" description="Подготавливаем вакансии, объявления и ваш профиль." />;
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
