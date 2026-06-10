import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calculator, MonitorDown, Smartphone, Globe } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { Button, Card } from '../ui/ui';

const REPO = 'https://github.com/your-org/taxtoo/releases/latest';

export default function DownloadPage() {
  const { t } = useTranslation();
  const { isInstallable, triggerInstall } = useInstallPrompt();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
            <Calculator className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg">Taxtoo</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-6">{t('download.title')}</h1>

        <div className="grid gap-3">
          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MonitorDown className="w-6 h-6 text-sky-500" />
              <span className="font-medium text-sm">{t('download.windows')}</span>
            </div>
            <a href={REPO} target="_blank" rel="noreferrer">
              <Button variant="secondary">.exe</Button>
            </a>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-emerald-500" />
              <span className="font-medium text-sm">{t('download.android')}</span>
            </div>
            <a href={REPO} target="_blank" rel="noreferrer">
              <Button variant="secondary">.apk</Button>
            </a>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-6 h-6 text-indigo-500" />
              <div>
                <div className="font-medium text-sm">{t('download.pwa')}</div>
                <div className="text-xs text-slate-500">{t('download.pwaDesc')}</div>
              </div>
            </div>
            {isInstallable && <Button onClick={triggerInstall}>{t('download.install')}</Button>}
          </Card>
        </div>

        <Link to="/" className="inline-flex items-center gap-2 mt-8 text-sm text-sky-500 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          {t('legal.backHome')}
        </Link>
      </div>
    </div>
  );
}
