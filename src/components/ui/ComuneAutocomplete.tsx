import { useEffect, useRef, useState } from 'react';
import { loadComuni, searchComuni, type Comune } from '../../lib/comuni/comuni';
import { cn } from '../../lib/utils';

const fieldClass =
  'w-full rounded-xl bg-slate-50 dark:bg-slate-800/60 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 transition-shadow';

interface Props {
  value: string;
  onSelect: (c: Comune) => void;
  onChange: (text: string) => void;
  placeholder?: string;
}

/** Searchable Italian comune picker. On select, the parent gets the full Comune
 *  (name + codice catastale + provincia + ISTAT). */
export default function ComuneAutocomplete({ value, onSelect, onChange, placeholder }: Props) {
  const [list, setList] = useState<Comune[]>([]);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Comune[]>([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadComuni().then(setList).catch(() => {});
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleInput = (text: string) => {
    onChange(text);
    const r = searchComuni(list, text);
    setResults(r);
    setActive(0);
    setOpen(r.length > 0);
  };

  const choose = (c: Comune) => {
    onSelect(c);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => {
          if (value) {
            const r = searchComuni(list, value);
            setResults(r);
            setOpen(r.length > 0);
          }
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl bg-white dark:bg-slate-900 ring-1 ring-black/10 dark:ring-white/10 shadow-lg overflow-hidden">
          {results.map((c, i) => (
            <button
              key={`${c.istat}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              className={cn(
                'w-full text-left px-3.5 py-2 text-sm flex items-center justify-between gap-2',
                i === active ? 'bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <span className="truncate">
                {c.name} <span className="text-xs text-slate-400">({c.sigla})</span>
              </span>
              <span className="font-mono text-xs text-sky-600 dark:text-sky-400 shrink-0">
                {c.catastale}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
