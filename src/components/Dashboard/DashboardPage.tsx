import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, User, Home, FileText, Calculator, Cloud, Trash2, Loader2, FileUp } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { ensureTaxpayerFolder, ensurePropertyFolders, uploadFile } from '../../services/storage';
import type { Taxpayer, Property } from '../../types';
import { Badge, Button, Card, SectionTitle } from '../ui/ui';
import TaxpayerForm from './TaxpayerForm';
import PropertyForm from './PropertyForm';
import PropertyImport from './PropertyImport';

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-sky-500" />
      </div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    taxpayers,
    properties,
    documents,
    calculations,
    activeFiscalCode,
    setActiveFiscalCode,
    addTaxpayer,
    updateTaxpayer,
    removeTaxpayer,
    addProperty,
    updateProperty,
    removeProperty,
  } = useStore();

  const [showTaxpayerForm, setShowTaxpayerForm] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showPropertyImport, setShowPropertyImport] = useState(false);
  const [savingTaxpayer, setSavingTaxpayer] = useState(false);
  const [taxpayerError, setTaxpayerError] = useState<string | null>(null);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const active = taxpayers.find((tp) => tp.fiscalCode === activeFiscalCode) ?? taxpayers[0];
  const activeProperties = properties.filter(
    (p) => p.taxpayerFiscalCode === active?.fiscalCode && p.status !== 'sold'
  );

  const providerLabel = user?.provider === 'microsoft' ? 'OneDrive' : 'Google Drive';

  // Save the taxpayer locally, then persist profile.json to the user's Drive.
  const handleSaveTaxpayer = async (tp: Taxpayer) => {
    addTaxpayer(tp);
    setActiveFiscalCode(tp.fiscalCode);
    setShowTaxpayerForm(false);
    setTaxpayerError(null);
    if (!user) {
      setTaxpayerError(t('dashboard.notConnected'));
      return;
    }
    setSavingTaxpayer(true);
    try {
      const folderId = await ensureTaxpayerFolder(user, tp.fiscalCode);
      const fileId = await uploadFile(
        user,
        'profile.json',
        JSON.stringify(tp, null, 2),
        'application/json',
        folderId
      );
      updateTaxpayer(tp.fiscalCode, { driveProfileFileId: fileId });
    } catch (e) {
      setTaxpayerError(e instanceof Error ? e.message : 'Errore nel salvataggio su Drive');
    } finally {
      setSavingTaxpayer(false);
    }
  };

  // Save the property locally, then persist property.json to the user's Drive.
  const handleSaveProperty = async (p: Property) => {
    addProperty(p);
    setShowPropertyForm(false);
    setPropertyError(null);
    if (!user) {
      setPropertyError(t('dashboard.notConnected'));
      return;
    }
    setSavingProperty(true);
    try {
      const propertyKey = `${p.municipalityCode}_${p.id}`;
      const folders = await ensurePropertyFolders(user, p.taxpayerFiscalCode, propertyKey);
      const fileId = await uploadFile(
        user,
        'property.json',
        JSON.stringify(p, null, 2),
        'application/json',
        folders.propertyFolderId
      );
      updateProperty(p.id, { drivePropertyFileId: fileId });
    } catch (e) {
      setPropertyError(e instanceof Error ? e.message : 'Errore nel salvataggio su Drive');
    } finally {
      setSavingProperty(false);
    }
  };

  // Mark a property as sold (it leaves the active list) and persist to Drive.
  const handleMarkSold = async (propertyId: string, date?: string) => {
    const p = properties.find((x) => x.id === propertyId);
    updateProperty(propertyId, { status: 'sold', disposalDate: date });
    setShowPropertyImport(false);
    if (!user || !p) return;
    setSavingProperty(true);
    setPropertyError(null);
    try {
      const updated = { ...p, status: 'sold' as const, disposalDate: date, updatedAt: new Date().toISOString() };
      const propertyKey = `${p.municipalityCode}_${p.id}`;
      const folders = await ensurePropertyFolders(user, p.taxpayerFiscalCode, propertyKey);
      await uploadFile(
        user,
        'property.json',
        JSON.stringify(updated, null, 2),
        'application/json',
        folders.propertyFolderId
      );
    } catch (e) {
      setPropertyError(e instanceof Error ? e.message : 'Errore nel salvataggio su Drive');
    } finally {
      setSavingProperty(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          {user && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('dashboard.welcome')}, {user.name.split(' ')[0]}
            </p>
          )}
        </div>
        <Button onClick={() => navigate('/calculations')}>
          <Calculator className="w-4 h-4" />
          {t('dashboard.newCalculation')}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={User} label={t('dashboard.taxpayers')} value={taxpayers.length} />
        <Stat icon={Home} label={t('dashboard.properties')} value={properties.length} />
        <Stat icon={FileText} label={t('dashboard.documents')} value={documents.length} />
        <Stat icon={Calculator} label={t('dashboard.calculations')} value={calculations.length} />
      </div>

      <Card className="p-3 flex items-center gap-3">
        <Cloud className="w-5 h-5 text-sky-500" />
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {t('dashboard.storageConnected', { provider: providerLabel })}
        </span>
      </Card>

      {/* Taxpayers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{t('dashboard.taxpayers')}</SectionTitle>
          {!showTaxpayerForm && (
            <Button variant="secondary" onClick={() => setShowTaxpayerForm(true)}>
              <Plus className="w-4 h-4" />
              {t('dashboard.addTaxpayer')}
            </Button>
          )}
        </div>

        {showTaxpayerForm && (
          <Card className="p-4 mb-3">
            <TaxpayerForm
              onSave={handleSaveTaxpayer}
              onCancel={() => setShowTaxpayerForm(false)}
            />
          </Card>
        )}

        {savingTaxpayer && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('settings.saving')}
          </div>
        )}
        {taxpayerError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-sm px-3 py-2 mb-3">
            {taxpayerError}
          </div>
        )}

        {taxpayers.length === 0 && !showTaxpayerForm ? (
          <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('dashboard.emptyTaxpayers')}
          </Card>
        ) : (
          <div className="grid gap-2">
            {taxpayers.map((tp) => (
              <Card
                key={tp.fiscalCode}
                className={`p-4 flex items-center justify-between cursor-pointer transition-all ${
                  tp.fiscalCode === active?.fiscalCode ? 'ring-2 ring-sky-500' : ''
                }`}
              >
                <button
                  className="flex items-center gap-3 text-left flex-1"
                  onClick={() => setActiveFiscalCode(tp.fiscalCode)}
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-semibold">
                    {tp.firstName.charAt(0)}
                    {tp.lastName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      {tp.firstName} {tp.lastName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {tp.fiscalCode}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => removeTaxpayer(tp.fiscalCode)}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Properties of active taxpayer */}
      {active && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>{t('dashboard.properties')}</SectionTitle>
            {!showPropertyForm && !showPropertyImport && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowPropertyImport(true)}>
                  <FileUp className="w-4 h-4" />
                  {t('propertyImport.button')}
                </Button>
                <Button variant="secondary" onClick={() => setShowPropertyForm(true)}>
                  <Plus className="w-4 h-4" />
                  {t('property.add')}
                </Button>
              </div>
            )}
          </div>

          {showPropertyImport && (
            <div className="mb-3">
              <PropertyImport
                taxpayerFiscalCode={active.fiscalCode}
                existing={activeProperties}
                onCreateProperty={handleSaveProperty}
                onMarkSold={handleMarkSold}
                onClose={() => setShowPropertyImport(false)}
              />
            </div>
          )}

          {showPropertyForm && (
            <Card className="p-4 mb-3">
              <PropertyForm
                taxpayerFiscalCode={active.fiscalCode}
                onSave={handleSaveProperty}
                onCancel={() => setShowPropertyForm(false)}
              />
            </Card>
          )}

          {savingProperty && (
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('settings.saving')}
            </div>
          )}
          {propertyError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-sm px-3 py-2 mb-3">
              {propertyError}
            </div>
          )}

          {activeProperties.length === 0 && !showPropertyForm ? (
            <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('property.empty')}
            </Card>
          ) : (
            <div className="grid gap-2">
              {activeProperties.map((p) => (
                <Card key={p.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                      <Home className="w-4.5 h-4.5 text-emerald-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{p.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {p.municipality} · <span className="font-mono">{p.municipalityCode}</span> ·{' '}
                        {t(`property.usage.${p.usageType}` as Parameters<typeof t>[0])}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="amber">
                      {t(`property.status.${p.status}` as Parameters<typeof t>[0])}
                    </Badge>
                    <button
                      onClick={() => removeProperty(p.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
