import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Calculator, Sparkles, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const items = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard', end: true },
  { to: '/documents', icon: FileText, key: 'nav.documents', end: false },
  { to: '/calculations', icon: Calculator, key: 'nav.calculations', end: false },
  { to: '/assistant', icon: Sparkles, key: 'nav.assistant', end: false },
  { to: '/settings', icon: Settings, key: 'nav.settings', end: false },
] as const;

export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur pb-safe">
      <div className="mx-auto max-w-3xl grid grid-cols-5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('w-5 h-5', isActive && 'scale-110 transition-transform')} />
                <span>{t(item.key as Parameters<typeof t>[0])}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
