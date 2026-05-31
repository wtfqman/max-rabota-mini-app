import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export function AppBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/') {
    return null;
  }

  const goBack = () => {
    const historyState = window.history.state as { idx?: number } | null;

    if (historyState?.idx && historyState.idx > 0) {
      navigate(-1);
      return;
    }

    navigate('/');
  };

  return (
    <button
      type="button"
      className="sticky top-3 z-40 mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-accent-green/35 bg-surface-950/92 px-4 py-2 text-sm font-extrabold text-text-primary shadow-[0_10px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl transition hover:border-accent-green/70 hover:text-accent-green active:scale-[0.98]"
      aria-label="Вернуться назад"
      onClick={goBack}
    >
      <ChevronLeft size={18} />
      Назад
    </button>
  );
}
