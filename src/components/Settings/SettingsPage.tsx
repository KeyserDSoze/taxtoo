import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LogOut, Save, Loader2, ExternalLink } from 'lucide-react';
import i18n, { SUPPORTED_LANGUAGES } from '../../i18n/index';
import { useStore } from '../../store/useStore';
import { saveSettings } from '../../services/storage';
import { Button, Card, Field, Input, Select, SectionTitle } from '../ui/ui';
import type { AppSettings } from '../../types';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, settings, settingsDriveFileId, setSettings, logout } = useStore();

  const [form, setForm] = useState<AppSettings>({
    azureOpenAIEndpoint: settings?.azureOpenAIEndpoint ?? '',
    azureOpenAIKey: settings?.azureOpenAIKey ?? '',
    modelChat: settings?.modelChat ?? 'gpt-4o',
    docIntelEndpoint: settings?.docIntelEndpoint ?? '',
    docIntelKey: settings?.docIntelKey ?? '',
    language: settings?.language ?? i18n.language ?? 'it',
    explanationLanguage: settings?.explanationLanguage ?? settings?.language ?? 'it',
    theme: settings?.theme ?? 'auto',
    autoSave: settings?.autoSave ?? true,
    rootFolderId: settings?.rootFolderId,
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.azureOpenAIEndpoint || !form.azureOpenAIKey) {
      setError(t('settings.errorRequired'));
      setStatus('error');
      return;
    }
    setError(null);
    setStatus('saving');
    try {
      // Apply language immediately
      if (form.language) i18n.changeLanguage(form.language);
      if (user) {
        const fileId = await saveSettings(user, form, settingsDriveFileId);
        setSettings(form, fileId);
      } else {
        setSettings(form);
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.errorSave'));
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>

      {/* Account */}
      <Card className="p-4">
        <SectionTitle>{t('settings.account')}</SectionTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center font-semibold">
                {user?.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium text-sm">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
          </div>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="w-4 h-4" />
            {t('settings.logout')}
          </Button>
        </div>
      </Card>

      {/* AI */}
      <Card className="p-4 space-y-3">
        <SectionTitle hint={t('app.poweredBy')}>{t('settings.ai')}</SectionTitle>
        <Field label={t('settings.azureEndpoint')}>
          <Input
            value={form.azureOpenAIEndpoint}
            onChange={(e) => set('azureOpenAIEndpoint', e.target.value)}
            placeholder="https://my-resource.openai.azure.com"
          />
        </Field>
        <Field label={t('settings.azureKey')}>
          <Input
            type="password"
            value={form.azureOpenAIKey}
            onChange={(e) => set('azureOpenAIKey', e.target.value)}
          />
        </Field>
        <Field label={t('settings.modelChat')}>
          <Input value={form.modelChat} onChange={(e) => set('modelChat', e.target.value)} />
        </Field>
        <Field label={t('settings.docIntelEndpoint')}>
          <Input
            value={form.docIntelEndpoint}
            onChange={(e) => set('docIntelEndpoint', e.target.value)}
            placeholder="https://my-docintel.cognitiveservices.azure.com"
          />
        </Field>
        <Field label={t('settings.docIntelKey')}>
          <Input
            type="password"
            value={form.docIntelKey}
            onChange={(e) => set('docIntelKey', e.target.value)}
          />
        </Field>
      </Card>

      {/* Preferences */}
      <Card className="p-4 space-y-3">
        <SectionTitle>{t('settings.preferences')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('settings.language')}>
            <Select value={form.language} onChange={(e) => set('language', e.target.value)}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.explanationLanguage')}>
            <Select
              value={form.explanationLanguage}
              onChange={(e) => set('explanationLanguage', e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.theme')}>
            <Select
              value={form.theme}
              onChange={(e) => set('theme', e.target.value as AppSettings['theme'])}
            >
              <option value="auto">{t('settings.themeAuto')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {status === 'saving' ? t('settings.saving') : t('settings.save')}
        </Button>
        {status === 'saved' && <span className="text-sm text-emerald-500">{t('settings.saved')}</span>}
        {status === 'error' && error && <span className="text-sm text-red-500">{error}</span>}
      </div>

      {/* Legal */}
      <Card className="p-4">
        <SectionTitle>{t('settings.legal')}</SectionTitle>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {[
            { to: '/terms', label: t('settings.terms') },
            { to: '/privacy', label: t('settings.privacy') },
            { to: '/download', label: t('settings.download') },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center justify-between py-3 text-sm hover:text-sky-500 transition-colors"
            >
              {l.label}
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Link>
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-slate-400">Taxtoo v{__APP_VERSION__}</p>
    </div>
  );
}
