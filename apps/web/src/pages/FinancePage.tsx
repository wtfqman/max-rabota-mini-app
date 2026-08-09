import { useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { AdminFinanceDashboard, AdminFinanceMetric } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';

export function FinancePage() {
  const role = useAppStore((state) => state.user.role);
  const financeEnabled = useAppStore((state) => state.features.FINANCE_DASHBOARD_ENABLED);
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [dashboard, setDashboard] = useState<AdminFinanceDashboard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!isAdmin || !financeEnabled) {
      setStatus('ready');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getAdminFinance({ from, to })
      .then((response) => {
        if (!active) {
          return;
        }

        setDashboard(response.data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [financeEnabled, from, isAdmin, reloadKey, to]);

  const exportCsv = async () => {
    setExporting(true);
    setError(null);

    try {
      const csv = await apiClient.exportAdminFinanceCsv({ from, to });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rabst24-finance-${from}-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'profile_load'));
    } finally {
      setExporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <AppPage>
        <EmptyState
          title="Финансы доступны только администратору"
          description="Модераторы могут работать с объявлениями и жалобами, но финансовая панель закрыта."
        />
      </AppPage>
    );
  }

  if (!financeEnabled) {
    return (
      <AppPage>
        <EmptyState
          title="Финансы выключены"
          description="Финансовая панель скрыта, пока функция не включена администратором."
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <section className="app-surface app-topline rounded-panel p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent-green">Admin</p>
            <h1 className="text-2xl font-black text-text-primary">Финансы</h1>
            <p className="text-sm leading-5 text-text-secondary">Серверная агрегация оплат, возвратов и net revenue.</p>
          </div>
        </div>
      </section>

      <SectionCard title="Период">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="С" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input label="По" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
            Обновить
          </ActionButton>
          <ActionButton variant="secondary" icon={<Download size={18} />} disabled={exporting} onClick={() => void exportCsv()}>
            {exporting ? 'Экспорт...' : 'CSV export'}
          </ActionButton>
        </div>
      </SectionCard>

      {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <EmptyState title="Не удалось загрузить финансы" description={error ?? 'Попробуйте обновить.'} /> : null}

      {status === 'ready' && dashboard ? (
        <>
          <MetricSection title="Сегодня" metric={dashboard.today} />
          <MetricSection title="7 дней" metric={dashboard.sevenDays} />
          <MetricSection title="30 дней" metric={dashboard.thirtyDays} />
          <MetricSection title="Выбранный период" metric={dashboard.selectedPeriod} />
        </>
      ) : null}
    </AppPage>
  );
}

function MetricSection({ title, metric }: { title: string; metric: AdminFinanceMetric }) {
  return (
    <SectionCard title={title}>
      <div className="flex flex-wrap gap-2">
        <StatChip label="выручка" value={`${metric.revenue} RUB`} tone="green" />
        <StatChip label="успешные оплаты" value={String(metric.succeededPayments)} />
        <StatChip label="средний чек" value={`${metric.averageCheck} RUB`} />
        <StatChip label="возвраты" value={`${metric.refunds} RUB`} />
        <StatChip label="net revenue" value={`${metric.netRevenue} RUB`} tone="green" />
        <StatChip label="promotion" value={`${metric.revenuePromotions} RUB`} />
        <StatChip label="contact unlocks" value={`${metric.revenueContactUnlocks} RUB`} />
        <StatChip label="errors" value={String(metric.paymentErrors)} />
        <StatChip label="pending" value={String(metric.pendingPayments)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FinanceList
          title="Revenue by purpose"
          empty="Нет выручки"
          items={metric.revenueByPurpose.map((item) => ({
            key: item.purpose,
            label: item.purpose,
            value: `${item.netRevenue} RUB · ${item.count}`
          }))}
        />
        <FinanceList
          title="Популярные тарифы"
          empty="Тарифов пока нет"
          items={metric.popularTariffs.map((item) => ({
            key: item.label,
            label: item.label,
            value: `${item.revenue} RUB · ${item.count}`
          }))}
        />
      </div>
    </SectionCard>
  );
}

function FinanceList({ title, empty, items }: { title: string; empty: string; items: Array<{ key: string; label: string; value: string }> }) {
  return (
    <div className="rounded-panel border border-white/10 bg-surface-950/50 p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-text-muted">{title}</p>
      {items.length === 0 ? <p className="mt-2 text-sm text-text-secondary">{empty}</p> : null}
      <div className="mt-2 grid gap-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 rounded-panel border border-white/8 bg-surface-900/80 px-3 py-2">
            <span className="truncate text-sm font-bold text-text-primary">{item.label}</span>
            <span className="shrink-0 text-sm font-extrabold text-accent-green">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}
