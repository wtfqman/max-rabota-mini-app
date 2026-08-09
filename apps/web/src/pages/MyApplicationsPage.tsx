import { useEffect, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, RefreshCw, Send, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { JobApplication, JobApplicationStatus } from '../features/applications/application.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';

const statusTabs: Array<{ value: JobApplicationStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'viewed', label: 'Просмотрены' },
  { value: 'contacted', label: 'Связались' },
  { value: 'suitable', label: 'Подходит' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'withdrawn', label: 'Отозваны' }
];

export function MyApplicationsPage() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<JobApplicationStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listMyJobApplications(filter === 'all' ? {} : { status: filter })
      .then((response) => {
        if (!active) {
          return;
        }

        setApplications(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'applications_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [filter, reloadKey]);

  const withdraw = async (application: JobApplication) => {
    setBusyId(application.id);
    setError(null);

    try {
      const response = await apiClient.withdrawJobApplication(application.id);
      setApplications((items) => items.map((item) => (item.id === application.id ? response.data : item)));
    } catch (requestError: unknown) {
      setError(getUserFacingError(requestError, 'application_withdraw'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppPage>
      <Link to="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <ArrowLeft size={17} />
        В профиль
      </Link>

      <SectionCard title="Мои отклики" description="Статусы меняет работодатель, внутреннего чата здесь нет.">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusTabs.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`min-h-10 shrink-0 rounded-panel border px-3 text-sm font-extrabold transition ${
                filter === item.value
                  ? 'border-accent-green bg-accent-greenSoft text-accent-green'
                  : 'border-white/10 bg-surface-850 text-text-secondary'
              }`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {status === 'loading' ? <LoadingApplications /> : null}

      {error ? (
        <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}

      {status === 'error' ? (
        <EmptyState
          title="Не удалось загрузить отклики"
          description="Попробуйте обновить список."
          action={<ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>Обновить</ActionButton>}
        />
      ) : null}

      {status === 'ready' && applications.length === 0 ? (
        <EmptyState
          title="Откликов пока нет"
          description="Когда вы откликнетесь на вакансию, она появится здесь."
          action={<LinkButton to="/vacancies">Найти вакансии</LinkButton>}
        />
      ) : null}

      <div className="grid gap-3">
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            busy={busyId === application.id}
            onWithdraw={() => void withdraw(application)}
          />
        ))}
      </div>
    </AppPage>
  );
}

function ApplicationCard({
  application,
  busy,
  onWithdraw
}: {
  application: JobApplication;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const canWithdraw = application.status === 'new' || application.status === 'viewed' || application.status === 'contacted';

  return (
    <article className="grid gap-3 rounded-panel border border-white/10 bg-surface-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/vacancies/${application.vacancy.id}`} className="text-base font-black text-text-primary">
            {application.vacancy.title}
          </Link>
          <p className="mt-1 text-sm text-text-secondary">{application.vacancy.subtitle ?? application.vacancy.locationShort}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {application.resumeSnapshot ? (
        <div className="rounded-panel border border-white/8 bg-surface-900/80 p-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Резюме</p>
          <p className="mt-1 text-sm font-extrabold text-text-primary">{application.resumeSnapshot.title}</p>
          {application.resumeSnapshot.subtitle ? <p className="mt-1 text-sm text-text-secondary">{application.resumeSnapshot.subtitle}</p> : null}
        </div>
      ) : null}

      {application.coverMessage ? (
        <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">{application.coverMessage}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-muted">Отправлен {formatDate(application.createdAt)}</span>
        {canWithdraw ? (
          <ActionButton variant="danger" icon={<XCircle size={17} />} disabled={busy} onClick={onWithdraw}>
            Отозвать
          </ActionButton>
        ) : null}
      </div>
    </article>
  );
}

function LoadingApplications() {
  return (
    <div className="grid gap-3">
      <div className="h-32 animate-pulse rounded-panel bg-surface-850" />
      <div className="h-32 animate-pulse rounded-panel bg-surface-850" />
    </div>
  );
}

function StatusBadge({ status }: { status: JobApplicationStatus }) {
  return <StatChip label={applicationStatusLabel(status)} tone={status === 'suitable' ? 'green' : 'neutral'} icon={<BriefcaseBusiness size={15} />} />;
}

function LinkButton({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-extrabold text-surface-950 shadow-glow"
    >
      <Send size={18} />
      {children}
    </Link>
  );
}

function applicationStatusLabel(status: JobApplicationStatus): string {
  const labels: Record<JobApplicationStatus, string> = {
    new: 'Новый',
    viewed: 'Просмотрен',
    contacted: 'Связались',
    suitable: 'Подходит',
    rejected: 'Отказ',
    withdrawn: 'Отозван'
  };

  return labels[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}
