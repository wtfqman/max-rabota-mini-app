import {
  BriefcaseBusiness,
  FileUser,
  Hammer,
  HardHat,
  Package,
  PlusCircle,
  ShieldCheck,
  Wrench
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPage } from '../shared/ui/AppPage.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { TileCard } from '../shared/ui/TileCard.js';

const tiles = [
  {
    to: '/vacancies',
    title: 'Вакансии',
    description: 'Работа рядом и быстрый отклик',
    icon: <BriefcaseBusiness size={22} />,
    tone: 'green' as const
  },
  {
    to: '/resumes',
    title: 'Резюме',
    description: 'Специалисты, опыт и контакты',
    icon: <FileUser size={22} />,
    tone: 'cyan' as const
  },
  {
    to: '/equipment',
    title: 'Строительная техника',
    description: 'Аренда и предложения для объектов',
    icon: <Hammer size={22} />,
    tone: 'amber' as const
  },
  {
    to: '/materials',
    title: 'Строительные материалы',
    description: 'Материалы рядом и с понятной ценой',
    icon: <Package size={22} />,
    tone: 'green' as const
  },
  {
    to: '/tools',
    title: 'Инструменты',
    description: 'Инструмент для стройки и ремонта',
    icon: <Wrench size={22} />,
    tone: 'violet' as const
  }
];

export function HomePage() {
  return (
    <AppPage>
      <section className="overflow-hidden rounded-panel border border-accent-green/18 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.18),transparent_42%),linear-gradient(180deg,rgba(16,27,21,0.98),rgba(7,12,10,0.98))] p-5 shadow-glow app-fade-up">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green shadow-[0_14px_36px_rgba(52,211,153,0.18)]">
              <HardHat size={29} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-green">Rabst24</p>
              <h1 className="text-3xl font-black leading-tight text-text-primary">Работа и стройка в MAX</h1>
            </div>
          </div>
          <p className="max-w-md text-base leading-6 text-text-secondary">
            Вакансии, резюме, техника, материалы и инструменты в одном спокойном приложении.
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Link
              to="/create"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-panel bg-accent-green px-4 text-base font-bold text-surface-950 shadow-glow transition active:scale-[0.985]"
            >
              <PlusCircle size={19} />
              Разместить
            </Link>
            <StatChip label="Проверка" value="бережно" tone="green" icon={<ShieldCheck size={15} />} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        {tiles.map((tile) => (
          <TileCard key={tile.to} {...tile} />
        ))}
      </section>
    </AppPage>
  );
}
