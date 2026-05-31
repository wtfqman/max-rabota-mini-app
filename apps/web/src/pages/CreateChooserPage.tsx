import type { LucideIcon } from 'lucide-react';
import { ArrowRight, FileUser, HardHat, Package, Truck, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPage } from '../shared/ui/AppPage.js';

interface CreateOption {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const options: CreateOption[] = [
  {
    to: '/create/vacancy',
    title: 'Вакансия',
    description: 'Найти сотрудника.',
    icon: HardHat
  },
  {
    to: '/create/resume',
    title: 'Резюме',
    description: 'Предложить услуги.',
    icon: FileUser
  },
  {
    to: '/create/equipment',
    title: 'Техника',
    description: 'Аренда и продажа.',
    icon: Truck
  },
  {
    to: '/create/material',
    title: 'Материалы',
    description: 'Продажа и доставка.',
    icon: Package
  },
  {
    to: '/create/tool',
    title: 'Инструменты',
    description: 'Продажа или аренда.',
    icon: Wrench
  }
];

export function CreateChooserPage() {
  return (
    <AppPage className="space-y-2.5">
      <section className="app-surface app-topline overflow-hidden rounded-panel p-3 shadow-glow app-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent-green">
              Размещение
            </p>
            <h1 className="mt-1 text-[24px] font-black leading-[1.02] text-text-primary">
              Что разместить?
            </h1>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel border border-accent-green/30 bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] text-surface-950 shadow-[0_10px_24px_rgba(34,197,94,0.18)]">
            <HardHat size={21} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 app-fade-up" aria-label="Типы объявлений">
        {options.map((option) => (
          <CreateTypeCard key={option.to} option={option} />
        ))}
      </section>
    </AppPage>
  );
}

function CreateTypeCard({ option }: { option: CreateOption }) {
  const Icon = option.icon;

  return (
    <Link
      to={option.to}
      className="app-surface app-topline group grid min-h-[86px] grid-rows-[auto_1fr] rounded-panel p-2.5 transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel border border-accent-green/22 bg-accent-greenSoft text-accent-green">
          <Icon size={19} />
        </span>
        <ArrowRight
          className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-green"
          size={15}
        />
      </div>

      <div className="min-w-0 self-end space-y-0.5">
        <h2 className="line-clamp-2 text-[13px] font-black leading-[1.05] text-text-primary min-[380px]:text-sm">
          {option.title}
        </h2>
        <p className="line-clamp-1 text-[11px] font-medium leading-4 text-text-secondary min-[380px]:text-xs">
          {option.description}
        </p>
      </div>
    </Link>
  );
}
