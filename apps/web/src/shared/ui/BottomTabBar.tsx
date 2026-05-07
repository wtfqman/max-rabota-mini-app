import { BriefcaseBusiness, FileUser, Home, PlusCircle, UserRound } from 'lucide-react';
import clsx from 'clsx';
import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Главная', icon: Home, match: (pathname: string) => pathname === '/' },
  {
    to: '/vacancies',
    label: 'Вакансии',
    icon: BriefcaseBusiness,
    match: (pathname: string) => pathname.startsWith('/vacancies')
  },
  { to: '/create', label: 'Создать', icon: PlusCircle, match: (pathname: string) => pathname.startsWith('/create') },
  { to: '/resumes', label: 'Резюме', icon: FileUser, match: (pathname: string) => pathname.startsWith('/resumes') },
  {
    to: '/profile',
    label: 'Профиль',
    icon: UserRound,
    match: (pathname: string) =>
      pathname.startsWith('/profile') ||
      pathname.startsWith('/favorites') ||
      pathname.startsWith('/my-ads') ||
      pathname.startsWith('/reviews') ||
      pathname.startsWith('/moderation')
  }
];

export function BottomTabBar() {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-surface-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto grid min-h-[78px] max-w-xl grid-cols-5 px-2 pt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.match(location.pathname);
          const isCreateTab = tab.to === '/create';

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={clsx(
                'flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-panel px-1 py-2 text-[12px] font-semibold transition duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-green',
                isCreateTab &&
                  'mx-1 -mt-5 min-h-[66px] border border-accent-green/25 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.22),transparent_65%),linear-gradient(180deg,rgba(17,31,24,0.98),rgba(9,17,13,0.98))] shadow-[0_16px_40px_rgba(52,211,153,0.18)]',
                isActive
                  ? clsx(
                      'translate-y-[-1px] text-accent-green',
                      isCreateTab
                        ? 'border-accent-green/45 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.26),transparent_65%),linear-gradient(180deg,rgba(18,35,27,1),rgba(10,18,14,1))]'
                        : 'bg-accent-greenSoft shadow-[0_10px_30px_rgba(52,211,153,0.08)]'
                    )
                  : clsx(
                      'text-text-muted hover:text-text-secondary',
                      isCreateTab ? 'hover:border-accent-green/35 hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'
                    )
              )}
            >
              <span
                className={clsx(
                  'flex items-center justify-center',
                  isCreateTab &&
                    'h-10 w-10 rounded-full bg-accent-green text-surface-950 shadow-[0_10px_30px_rgba(52,211,153,0.32)]'
                )}
              >
                <Icon size={isCreateTab ? 20 : 22} strokeWidth={2.2} />
              </span>
              <span className="w-full truncate text-center">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
