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
    <nav className="fixed inset-x-0 bottom-0 z-[120] w-full overflow-hidden border-t border-white/10 bg-surface-950/88 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mx-auto grid min-h-[66px] w-full max-w-xl grid-cols-5 px-1.5 pt-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.match(location.pathname);
          const isCreateTab = tab.to === '/create';

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={clsx(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-panel px-1 py-1.5 text-[10px] font-extrabold transition duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-green',
                isCreateTab &&
                  'mx-1 -mt-4 min-h-[58px] border border-accent-green/30 bg-[linear-gradient(180deg,rgba(17,56,41,0.98),rgba(5,8,7,0.98))] shadow-[0_16px_40px_rgba(34,197,94,0.18)]',
                isActive
                  ? clsx(
                      'translate-y-[-1px] text-accent-green',
                      isCreateTab
                        ? 'border-accent-green/50 bg-[linear-gradient(180deg,rgba(18,74,52,1),rgba(5,12,9,1))]'
                        : 'bg-accent-greenSoft shadow-[0_10px_28px_rgba(52,211,153,0.08)]'
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
                    'h-9 w-9 rounded-full bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] text-surface-950 shadow-[0_10px_30px_rgba(34,197,94,0.32)]'
                )}
              >
                <Icon size={isCreateTab ? 18 : 20} strokeWidth={2.2} />
              </span>
              <span className="w-full truncate text-center">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
