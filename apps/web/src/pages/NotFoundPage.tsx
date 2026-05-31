import { FullscreenState } from '../shared/ui/FullscreenState.js';

export function NotFoundPage() {
  return (
    <FullscreenState
      title="Экран не найден"
      description="Вернитесь на главную страницу"
      actionLabel="На главную"
      onAction={() => {
        window.location.assign('/');
      }}
    />
  );
}
