import type { ButtonHTMLAttributes } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ActionButton } from './ActionButton.js';

export function FilterButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ActionButton variant="secondary" icon={<SlidersHorizontal size={18} />} {...props}>
      Фильтры
    </ActionButton>
  );
}
