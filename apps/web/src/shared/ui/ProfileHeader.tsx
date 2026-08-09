import { UserRound } from 'lucide-react';
import { StatChip } from './StatChip.js';

interface ProfileHeaderProps {
  name: string;
  subtitle: string;
  avatarUrl?: string;
  stats: Array<{ label: string; value: string }>;
}

export function ProfileHeader({ name, subtitle, avatarUrl, stats }: ProfileHeaderProps) {
  return (
    <section className="app-surface app-topline rounded-panel p-3 text-center app-fade-up">
      <div className="flex items-center gap-3 text-left">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border-2 border-accent-green object-cover p-0.5" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-accent-green bg-accent-greenSoft p-0.5 text-accent-green shadow-[0_0_24px_rgba(52,211,153,0.16)]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-900">
              <UserRound size={22} />
            </span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black leading-tight text-text-primary">{name}</h1>
          <p className="truncate text-xs font-semibold text-text-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {stats.map((stat) => (
          <StatChip key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </div>
    </section>
  );
}
