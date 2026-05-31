import { Eye } from 'lucide-react';
import { SectionCard } from './SectionCard.js';
import { StatChip } from './StatChip.js';

interface PreviewCardProps {
  title: string;
  typeLabel: string;
  description: string;
}

export function PreviewCard({ title, typeLabel, description }: PreviewCardProps) {
  return (
    <SectionCard title="Предпросмотр" action={<Eye size={20} className="text-accent-green" />}>
      <div className="space-y-3">
        <StatChip label={typeLabel} tone="green" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text-primary">{title}</h2>
          <p className="text-sm leading-5 text-text-secondary">{description}</p>
        </div>
      </div>
    </SectionCard>
  );
}
