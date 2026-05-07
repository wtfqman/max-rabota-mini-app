import { ArrowRight, BriefcaseBusiness, FileUser, Package, Sparkles, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPage } from '../shared/ui/AppPage.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { SectionCard } from '../shared/ui/SectionCard.js';

const options = [
  {
    to: '/create/vacancy',
    title: 'Вакансия',
    description: 'Специальность, описание, зарплата, фото, адрес и контакты.',
    icon: BriefcaseBusiness,
    accent: 'green',
    badge: 'Найти сотрудника'
  },
  {
    to: '/create/resume',
    title: 'Резюме',
    description: 'Фото, ФИО, специальность, описание о себе, контакт и желаемая зарплата.',
    icon: FileUser,
    accent: 'cyan',
    badge: 'Рассказать о себе'
  },
  {
    to: '/create/material',
    title: 'Строительные материалы',
    description: 'Название, фото, описание, цена, адрес и телефон.',
    icon: Package,
    accent: 'amber',
    badge: 'Продать материалы'
  },
  {
    to: '/create/tool',
    title: 'Инструменты',
    description: 'Название, фото, описание, цена, адрес и контакт.',
    icon: Wrench,
    accent: 'green',
    badge: 'Разместить инструмент'
  }
] as const;

export function CreateChooserPage() {
  return (
    <AppPage>
      <section className="overflow-hidden rounded-panel border border-accent-green/15 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.18),transparent_42%),linear-gradient(180deg,rgba(16,27,21,0.98),rgba(8,14,11,0.98))] p-5 shadow-glow app-fade-up">
        <div className="space-y-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-accent-green/20 bg-accent-greenSoft px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-accent-green">
            <Sparkles size={14} />
            Создание
          </div>
          <div className="space-y-2">
            <h1 className="max-w-sm text-3xl font-black leading-[1.06] text-text-primary">
              Что хотите разместить?
            </h1>
            <p className="max-w-md text-base leading-6 text-text-secondary">
              Выберите тип объявления. Сразу откроем нужную форму с предпросмотром.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {options.map((option, index) => {
          const Icon = option.icon;

          return (
            <Link
              key={option.to}
              to={option.to}
              className="group relative overflow-hidden rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.98),rgba(9,14,12,0.98))] p-4 shadow-panel transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(52,211,153,0.6),transparent)] opacity-70" />
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={[
                        'flex h-12 w-12 items-center justify-center rounded-2xl border',
                        option.accent === 'green' &&
                          'border-accent-green/18 bg-accent-greenSoft text-accent-green',
                        option.accent === 'cyan' &&
                          'border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan',
                        option.accent === 'amber' &&
                          'border-accent-amber/20 bg-accent-amber/10 text-accent-amber'
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <Icon size={22} />
                    </div>
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        {option.badge}
                      </span>
                      <h2 className="text-xl font-black text-text-primary">{option.title}</h2>
                    </div>
                  </div>
                  <p className="max-w-md text-sm leading-6 text-text-secondary">{option.description}</p>
                </div>
                <div className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-text-muted transition group-hover:border-accent-green/30 group-hover:text-accent-green">
                  <ArrowRight size={18} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/6 pt-3 text-sm">
                <span className="text-text-muted">Шаг {index + 1}</span>
                <span className="font-semibold text-text-primary">Открыть форму</span>
              </div>
            </Link>
          );
        })}
      </section>

      <SectionCard
        title="Нужное откроется сразу"
        description="Каждый вариант ведёт в свою форму. Избранное и ваши объявления остаются в профиле."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton to="/profile" variant="secondary">
            Перейти в профиль
          </LinkButton>
          <LinkButton to="/favorites" variant="ghost">
            Открыть избранное
          </LinkButton>
        </div>
      </SectionCard>
    </AppPage>
  );
}
