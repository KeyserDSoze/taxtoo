import { Outlet } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { useStore } from '../../store/useStore';
import BottomNav from './BottomNav';

export default function AppLayout() {
  const user = useStore((s) => s.user);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="pt-safe" />
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
              <Calculator className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold tracking-tight text-lg">Taxtoo</span>
          </div>
          {user && (
            <div className="flex items-center gap-2.5">
              <span className="hidden sm:block text-sm text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                {user.name}
              </span>
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full ring-1 ring-black/5" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center text-sm font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 animate-fade-in-up">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
