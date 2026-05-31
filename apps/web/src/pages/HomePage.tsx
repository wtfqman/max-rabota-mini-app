import { ArrowRight, FileUser, HardHat, Package, PlusCircle, Truck } from 'lucide-react';
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
    description: 'Материалы, остатки, доставка.',
    icon: <Package size={21} />
  }
];

export function HomePage() {
  return (
    <AppPage className="space-y-3">
      <section className="app-surface app-topline overflow-hidden rounded-panel p-3 shadow-glow app-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-black leading-[1.04] text-text-primary min-[380px]:text-[26px]">
              Строительная биржа в MAX
            </h1>
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel border border-accent-green/30 bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] text-surface-950 shadow-[0_12px_28px_rgba(34,197,94,0.2)]">
            <HardHat size={23} />
          </div>
        </div>

        <Link
          to="/create"
          className="mt-3 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-panel border border-accent-green/30 bg-accent-greenSoft/80 px-3 text-xs font-black text-accent-green transition duration-200 hover:border-accent-green/50 hover:bg-accent-greenSoft active:scale-[0.985]"
        >
          <PlusCircle size={15} />
          Разместить
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-2.5 app-fade-up" aria-label="Разделы">
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="app-surface app-topline group flex min-h-[118px] flex-col justify-between rounded-panel p-3 transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel border border-accent-green/22 bg-accent-greenSoft text-accent-green">
                {section.icon}
              </span>
              <ArrowRight
                className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-green"
                size={16}
              />
            </div>

            <div className="min-w-0 space-y-1">
              <h2 className="line-clamp-2 text-[15px] font-black leading-[1.12] text-text-primary">
                {section.title}
              </h2>
              <p className="line-clamp-2 min-h-8 text-xs font-medium leading-4 text-text-secondary">
                {section.description}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </AppPage>
  );
}
