import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../shared/ui/BottomTabBar.js';

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-950 text-text-primary">
      <main className="mx-auto min-h-screen w-full max-w-xl px-4 pb-28 pt-5 app-fade-in">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
