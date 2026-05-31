import { useEffect, useState } from 'react';
import {
  ArrowRight,
  FileUser,
  HardHat,
  Package,
  PlusCircle,
  RefreshCw,
  Truck,
  Wrench
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PublicAdCard, VacancyListMeta } from '../features/vacancies/vacancy.types.js';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard, AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';

const FEATURED_PER_PAGE = 8;

const sections = [
  {
    to: '/vacancies',
    title: 'Вакансии',
    icon: <HardHat size={19} />
  },
  {
    to: '/resumes',
    title: 'Резюме',
    icon: <FileUser size={19} />
  },
  {
    to: '/equipment',
    title: 'Техника',
    icon: <Truck size={19} />
  },
  {
    to: '/materials',
    title: 'Материалы',
    icon: <Package size={19} />
  },
  {
    to: '/tools',
    title: 'Инструменты',
    icon: <Wrench size={19} />
  }
];

export function HomePage() {
  const [ads, setAds] = useState<PublicAdCard[]>([]);
  const [meta, setMeta] = useState<VacancyListMeta | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const accessToken = useAppStore((state) => state.accessToken);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listAds({ page: 1, perPage: FEATURED_PER_PAGE })
      .then((response) => {
        if (!active) {
          return;
        }

        setAds(response.data);
        setMeta(response.meta ?? null);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'vacancies_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!accessToken) {
      setFavoriteIds(new Set());
      return;
    }

    apiClient
      .listFavorites()
      .then((response) => setFavoriteIds(new Set(response.data.map((item) => item.ad.id))))
      .catch(() => setFavoriteIds(new Set()));
  }, [accessToken]);

  const toggleFavorite = (adId: string) => {
    if (!accessToken) {
      return;
    }

    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(adId)) {
        next.delete(adId);
        void apiClient.removeFavorite(adId).catch(() => setFavoriteIds(current));
      } else {
        next.add(adId);
        void apiClient.addFavorite(adId).catch(() => setFavoriteIds(current));
      }
      return next;
    });
  };

  return (
    <AppPage>
      <section className="app-surface app-topline overflow-hidden rounded-panel p-4 shadow-glow app-fade-up">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className="text-[28px] font-black leading-[1.04] text-text-primary min-[380px]:text-3xl">
                Строительная биржа в MAX
              </h1>
              <p className="max-w-[28rem] text-sm font-medium leading-5 text-text-secondary">
                Работа, сотрудники, техника, материалы и инструменты в одном месте.
              </p>
            </div>

            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-panel border border-accent-green/30 bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] text-surface-950 shadow-[0_14px_32px_rgba(34,197,94,0.22)] min-[360px]:flex">
              <HardHat size={25} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/create"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-black text-surface-950 shadow-glow transition duration-200 hover:brightness-105 active:scale-[0.985]"
            >
              <PlusCircle size={17} />
              Разместить
            </Link>
            <a
              href="#home-feed"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-panel border border-white/10 bg-surface-800/92 px-3 text-sm font-extrabold text-text-primary transition duration-200 hover:border-accent-green/45 hover:bg-surface-800 active:scale-[0.985]"
            >
              Объявления
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <section id="home-feed" className="space-y-3 scroll-mt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-text-primary">Свежие объявления</h2>
            <p className="text-xs font-semibold text-text-muted">
              {meta ? `Всего: ${meta.total}` : 'Вакансии, резюме, техника и товары'}
            </p>
          </div>
          <a
            href="#home-sections"
            className="shrink-0 text-sm font-extrabold text-accent-green transition hover:text-text-primary"
          >
            Разделы
          </a>
        </div>

        {status === 'loading' ? (
          <div className="grid grid-cols-2 gap-2.5" aria-label="Загрузка объявлений">
            <AdCardSkeleton variant="grid" />
            <AdCardSkeleton variant="grid" />
            <AdCardSkeleton variant="grid" />
            <AdCardSkeleton variant="grid" />
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/70 p-3">
            <div className="grid gap-3">
              <p className="text-sm font-semibold leading-5 text-accent-green">
                {error ?? 'Не получилось загрузить свежие объявления.'}
              </p>
              <ActionButton
                type="button"
                variant="secondary"
                icon={<RefreshCw size={17} />}
                onClick={() => setReloadKey((value) => value + 1)}
              >
                Обновить
              </ActionButton>
            </div>
          </div>
        ) : null}

        {status === 'ready' && ads.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5" aria-label="Свежие объявления">
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                variant="grid"
                to={getAdUrl(ad.type, ad.id)}
                typeLabel={typeLabel(ad.type)}
                title={ad.title}
                subtitle={ad.subtitle}
                coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
                coverMimeType={ad.coverPhoto?.mimeType}
                location={ad.locationShort}
                price={ad.shortSalary ?? undefined}
                category={ad.category}
                description={ad.description}
                chips={ad.chips.map((chip) => ({ key: chip.key, value: chip.value }))}
                isFavorite={favoriteIds.has(ad.id)}
                onFavoriteClick={() => toggleFavorite(ad.id)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section id="home-sections" className="grid grid-cols-2 gap-2.5 scroll-mt-4 min-[420px]:grid-cols-3" aria-label="Разделы">
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="group flex min-h-14 items-center gap-2 rounded-panel border border-white/8 bg-surface-900/92 px-3 text-sm font-extrabold text-text-primary transition duration-200 hover:border-accent-green/35 hover:bg-surface-850 active:scale-[0.985]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel border border-accent-green/20 bg-accent-greenSoft text-accent-green">
              {section.icon}
            </span>
            <span className="min-w-0 truncate">{section.title}</span>
          </Link>
        ))}
      </section>
    </AppPage>
  );
}

function typeLabel(type: PublicAdCard['type']): string {
  if (type === 'resume') {
    return 'Резюме';
  }

  if (type === 'equipment') {
    return 'Техника';
  }

  if (type === 'material') {
    return 'Материалы';
  }

  if (type === 'tool') {
    return 'Инструменты';
  }

  return 'Вакансия';
}

function getAdUrl(type: PublicAdCard['type'], adId: string): string {
  if (type === 'vacancy') {
    return `/vacancies/${adId}`;
  }

  if (type === 'resume') {
    return `/resumes/${adId}`;
  }

  if (type === 'equipment') {
    return `/equipment/${adId}`;
  }

  if (type === 'material') {
    return `/materials/${adId}`;
  }

  if (type === 'tool') {
    return `/tools/${adId}`;
  }

  return `/ads/${adId}`;
}
