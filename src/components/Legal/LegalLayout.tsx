import { Link } from 'react-router-dom';
import { ArrowLeft, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

export default function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
            <Calculator className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg">Taxtoo</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">{title}</h1>
        <p className="text-sm text-slate-500 mb-6">{t('legal.updated')}</p>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {children}
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-8 text-sm text-sky-500 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('legal.backHome')}
        </Link>
      </div>
    </div>
  );
}
