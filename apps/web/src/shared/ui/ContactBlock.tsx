import { Phone } from 'lucide-react';
import { Input } from './Input.js';
import { Select } from './Select.js';

export function ContactBlock() {
  return (
    <fieldset className="grid gap-3 rounded-panel border border-line bg-surface-900 p-3">
      <legend className="px-1 text-sm font-semibold text-text-secondary">Контакт</legend>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Phone size={17} className="text-accent-green" />
        Способ связи
      </div>
      <Select
        label="Тип"
        defaultValue="max"
        options={[
          { value: 'max', label: 'MAX' },
          { value: 'phone', label: 'Телефон' },
          { value: 'email', label: 'Email' }
        ]}
      />
      <Input label="Значение" placeholder="@username или телефон" />
    </fieldset>
  );
}
