import { ArrowRight, FileUser, HardHat, Package, PlusCircle, Truck, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPage } from '../shared/ui/AppPage.js';

const sections = [
  {
    to: '/vacancies',
    title: 'Вакансии',
    description: 'Работа и подработки рядом.',
    icon: <HardHat size={21} />
  },
  {
    to: '/resumes',
    title: 'Резюме',
    description: 'Специалисты и бригады.',
    icon: <FileUser size={21} />
  },
  {
    to: '/equipment',
    title: 'Строительная техника',
    description: 'Аренда и продажа техники.',
    icon: <Truck size={21} />
  },
  {
    to: '/materials',
    title: 'Строительные материалы',
    description: 'Материалы и доставка.',
    icon: <Package size={21} />
  },
  {
    to: '/tools',
    title: 'Инструменты',
    description: 'Продажа и аренда.',
    icon: <Wrench size={21} />
  }
];

export function HomePage() {
  return (
    <AppPage className="space-y-2.5">
      <section className="app-surface app-topline overflow-hidden rounded-panel p-2.5 shadow-glow app-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black leading-[1.02] text-text-primary min-[380px]:text-[24px]">
              Строительная биржа в MAX
            </h1>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel border border-accent-green/30 bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] text-surface-950 shadow-[0_10px_24px_rgba(34,197,94,0.18)]">
            <HardHat size={21} />
          </div>
        </div>

        <Link
          to="/create"
          className="mt-2 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-panel border border-accent-green/30 bg-accent-greenSoft/80 px-2.5 text-xs font-black text-accent-green transition duration-200 hover:border-accent-green/50 hover:bg-accent-greenSoft active:scale-[0.985]"
        >
          <PlusCircle size={14} />
          Разместить
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-2 app-fade-up" aria-label="Разделы">
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="app-surface app-topline group grid min-h-[86px] grid-rows-[auto_1fr] rounded-panel p-2.5 transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel border border-accent-green/22 bg-accent-greenSoft text-accent-green">
                {section.icon}
              </span>
              <ArrowRight
                className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-green"
                size={15}
              />
            </div>

            <div className="min-w-0 self-end space-y-0.5">
              <h2 className="line-clamp-2 text-[13px] font-black leading-[1.05] text-text-primary min-[380px]:text-sm">
                {section.title}
              </h2>
              <p className="line-clamp-1 text-[11px] font-medium leading-4 text-text-secondary min-[380px]:text-xs">
                {section.description}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </AppPage>
  );
}
