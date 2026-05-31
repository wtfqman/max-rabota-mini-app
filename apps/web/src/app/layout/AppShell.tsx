import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../shared/ui/BottomTabBar.js';
import { AppBackButton } from './AppBackButton.js';
import { ScrollToTop } from './ScrollToTop.js';
import { StartParamNavigator } from './StartParamNavigator.js';

export function AppShell() {
  return (
    <div className="app-shell min-h-screen text-text-primary">
      <ScrollToTop />
      <StartParamNavigator />
      <main className="mx-auto min-h-screen w-full max-w-xl overflow-x-hidden px-3 pb-32 pt-3 app-fade-in">
        <AppBackButton />
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
