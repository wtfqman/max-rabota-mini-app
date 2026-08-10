import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const HOME_SPLASH_SESSION_KEY = 'rabst24-home-splash-shown';
const HOME_SPLASH_DURATION_MS = 3000;

export function HomeSplash() {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    if (window.sessionStorage.getItem(HOME_SPLASH_SESSION_KEY) === '1') {
      return;
    }

    setIsVisible(true);

    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(HOME_SPLASH_SESSION_KEY, '1');
      setIsVisible(false);
    }, HOME_SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="home-splash" role="status" aria-label="Загрузка главной страницы">
      <div className="home-splash__logo" aria-hidden="true">
        <span>Работа</span>
        <span>Москва</span>
        <span>Стройка</span>
      </div>
    </div>
  );
}
