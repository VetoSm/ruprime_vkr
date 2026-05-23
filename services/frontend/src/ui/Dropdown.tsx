import { ReactNode, useEffect, useRef, useState } from 'react';
import { IconChevronDown } from './Icons';

/**
 * Кастомный dropdown — стилизованный под дашборд:
 * trigger-кнопка в темном стиле + анимированная панель опций.
 * Заменяет нативный <select> на /stats и других страницах.
 */

export interface DropdownOption {
  value: string;
  label: ReactNode;
  description?: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  label?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  maxHeight?: number;
  searchable?: boolean;
  className?: string;
}

export function Dropdown({
  value, onChange, options, label, placeholder = 'Выберите...', size = 'sm',
  align = 'left', maxHeight = 280, searchable = false, className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((o) => o.value === value);
  const filtered = searchable && search
    ? options.filter((o) => String(o.label).toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`dropdown ${size === 'md' ? 'dropdown--md' : ''} ${open ? 'open' : ''} ${className || ''}`}
    >
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="dropdown-trigger-text">
          {label && <span className="dropdown-trigger-label">{label}:&nbsp;</span>}
          <span className="dropdown-trigger-value">
            {currentOption ? currentOption.label : <span className="dropdown-trigger-placeholder">{placeholder}</span>}
          </span>
        </span>
        <IconChevronDown size={14} />
      </button>

      {open && (
        <div
          className="dropdown-panel"
          style={{ maxHeight, [align === 'right' ? 'right' : 'left']: 0 } as any}
          role="listbox"
        >
          {searchable && (
            <div className="dropdown-search">
              <input
                type="text"
                placeholder="Поиск…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="dropdown-options" style={{ maxHeight: searchable ? maxHeight - 48 : maxHeight }}>
            {filtered.length === 0 ? (
              <div className="dropdown-empty">Ничего не найдено</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`dropdown-option ${o.value === value ? 'active' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  role="option"
                  aria-selected={o.value === value}
                >
                  <span className="dropdown-option-label">{o.label}</span>
                  {o.description && <span className="dropdown-option-desc">{o.description}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
