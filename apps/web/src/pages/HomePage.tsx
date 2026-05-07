import {
  Bike,
  BriefcaseBusiness,
  FileUser,
  Heart,
  ListChecks,
  PlusCircle,
  ShieldCheck,
  Star
} from 'lucide-react';
import { AppPage } from '../shared/ui/AppPage.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { HeroBanner } from '../shared/ui/HeroBanner.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
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
    description: 'Специалисты, опыт и живые профили',
    icon: <FileUser size={22} />,
    tone: 'cyan' as const
  },
  {
    to: '/create/equipment',
    title: 'Техника',
    description: 'Аренда, услуги и спецпредложения',
    icon: <Bike size={22} />,
    tone: 'amber' as const
  }
];

const quick = [
  {
    to: '/create',
    title: 'Разместить',
    description: 'Новое объявление',
    icon: <PlusCircle size={22} />,
    tone: 'green' as const
  },
  {
    to: '/favorites',
    title: 'Избранное',
    description: 'Сохранённые объявления',
    icon: <Heart size={22} />,
    tone: 'violet' as const
  },
  {
    to: '/my-ads',
    title: 'Мои объявления',
    description: 'Статусы и правки',
    icon: <ListChecks size={22} />,
    tone: 'cyan' as const
  },
  {
    to: '/reviews',
    title: 'Отзывы',
    description: 'Репутация и доверие',
    icon: <Star size={22} />,
    tone: 'amber' as const
  }
];

export function HomePage() {
  return (
    <AppPage>
      <HeroBanner
        eyebrow="Rabst24"
        title="Работа и техника внутри MAX"
        description="Публикуйте объявления, находите людей и держите рабочие задачи в одном аккуратном интерфейсе."
        ctaLabel="Разместить объявление"
        ctaTo="/create"
        aside={<StatChip label="Проверка объявлений" value="24/7" tone="green" icon={<ShieldCheck size={15} />} />}
      />

      <section className="grid grid-cols-1 gap-3">
        {tiles.map((tile) => (
          <TileCard key={tile.to} {...tile} />
        ))}
      </section>

      <SectionCard title="Быстрые действия" description="Частые сценарии без лишних шагов.">
        <div className="grid grid-cols-2 gap-3">
          {quick.map((tile) => (
            <TileCard key={tile.to} {...tile} />
          ))}
        </div>
      </SectionCard>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-text-primary">Что сейчас востребовано</h2>
            <p className="text-sm leading-6 text-text-secondary">
              Пример того, как будут выглядеть свежие объявления в ленте.
            </p>
          </div>
          <StatChip label="Свежие" tone="cyan" />
        </div>
        <AdCard
          to="/vacancies/demo"
          typeLabel="Вакансия"
          title="Монтажник на объект"
          subtitle="Стабильный график и выплаты без задержек"
          location="Москва"
          price="от 120 000 ₽"
          description="Подойдёт тем, кто хочет быстро выйти на объект и работать в понятных условиях без лишней переписки."
        />
      </section>
    </AppPage>
  );
}
