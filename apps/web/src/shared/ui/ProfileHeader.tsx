import { StatChip } from './StatChip.js';

interface ProfileHeaderProps {
  name: string;
  subtitle: string;
  avatarUrl?: string;
  stats: Array<{ label: string; value: string }>;
}

export function ProfileHeader({ name, subtitle, avatarUrl, stats }: ProfileHeaderProps) {
  return (
    <section className="rounded-panel border border-accent-green/15 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.1),transparent_44%),linear-gradient(180deg,rgba(17,24,21,0.98),rgba(10,15,13,0.98))] p-5 shadow-panel app-fade-up">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-panel object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-panel bg-accent-greenSoft text-2xl font-black text-accent-green shadow-[0_0_24px_rgba(52,211,153,0.12)]">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black text-text-primary">{name}</h1>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {stats.map((stat) => (
          <StatChip key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </div>
    </section>
  );
}
