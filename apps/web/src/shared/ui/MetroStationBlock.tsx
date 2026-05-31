import { TrainFront } from 'lucide-react';
import { Input } from './Input.js';

export function MetroStationBlock() {
  return (
    <fieldset className="grid gap-3 rounded-panel border border-line bg-surface-900 p-3">
      <legend className="px-1 text-sm font-semibold text-text-secondary">Метро</legend>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <TrainFront size={17} className="text-accent-green" />
        Ближайшие станции
      </div>
      <Input label="Станция" placeholder="Павелецкая" />
      <Input label="Минут пешком" placeholder="7" inputMode="numeric" />
    </fieldset>
  );
}
