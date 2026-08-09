import { useState } from 'react';
import { Flag, Send, X } from 'lucide-react';
import { apiClient } from '../../shared/api/client.js';
import { getUserFacingError } from '../../shared/api/user-facing.js';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import type { AdReportReason } from './report.types.js';

const reasonOptions: Array<{ value: AdReportReason; label: string }> = [
  { value: 'FRAUD', label: 'Мошенничество' },
  { value: 'FALSE_INFORMATION', label: 'Недостоверная информация' },
  { value: 'NOT_ACTUAL', label: 'Неактуально' },
  { value: 'WRONG_PRICE', label: 'Неверная цена' },
  { value: 'SPAM', label: 'Спам' },
  { value: 'PROHIBITED_CONTENT', label: 'Запрещенный контент' },
  { value: 'OTHER', label: 'Другое' }
];

export function ReportAdSheet({ adId, title, onClose }: { adId: string; title: string; onClose: () => void }) {
  const [reason, setReason] = useState<AdReportReason>('FRAUD');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'ready' | 'submitting' | 'sent'>('ready');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStatus('submitting');
    setError(null);

    try {
      const response = await apiClient.createAdReport({
        adId,
        reason,
        comment: comment.trim() || undefined,
        evidence: {
          pageUrl: window.location.href
        }
      });

      setStatus('sent');
      if (response.data.report.duplicate) {
        setError('Открытая жалоба по этому объявлению уже есть. Модерация ее увидит.');
      }
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'ad_load'));
      setStatus('ready');
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-end bg-black/62 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" type="button" tabIndex={-1} aria-label="Закрыть" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-[24px] border border-white/10 bg-surface-950 p-4 shadow-[0_-24px_60px_rgba(0,0,0,0.52)]">
        <div className="mx-auto grid max-w-xl gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-extrabold text-accent-green">
                <Flag size={17} />
                Жалоба
              </div>
              <h2 className="mt-1 text-lg font-black text-text-primary">Пожаловаться на объявление</h2>
              <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{title}</p>
            </div>
            <ActionButton variant="secondary" aria-label="Закрыть" icon={<X size={18} />} onClick={onClose} />
          </div>

          {status === 'sent' ? (
            <div className="grid gap-3 rounded-panel border border-accent-green/25 bg-accent-greenSoft p-4 text-accent-green">
              <p className="font-extrabold">Жалоба отправлена</p>
              <p className="text-sm leading-5">Модератор проверит объявление. Автору не раскрывается, кто отправил жалобу.</p>
              {error ? <p className="text-sm font-semibold">{error}</p> : null}
              <ActionButton variant="secondary" onClick={onClose}>Готово</ActionButton>
            </div>
          ) : (
            <>
              <label className="grid gap-2 text-sm font-bold text-text-secondary">
                Причина
                <select
                  className="min-h-11 rounded-panel border border-white/10 bg-surface-900/80 px-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-green"
                  value={reason}
                  onChange={(event) => setReason(event.target.value as AdReportReason)}
                >
                  {reasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-text-secondary">
                Комментарий
                <textarea
                  className="min-h-28 resize-none rounded-panel border border-white/10 bg-surface-900/80 px-3 py-3 text-sm font-medium text-text-primary outline-none transition focus:border-accent-green"
                  maxLength={2000}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Опишите, что не так"
                />
              </label>

              {error ? (
                <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
              ) : null}

              <ActionButton icon={<Send size={18} />} disabled={status === 'submitting'} onClick={() => void submit()}>
                {status === 'submitting' ? 'Отправляем...' : 'Отправить жалобу'}
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
