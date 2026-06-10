import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, User, Home, FileText, Calculator, Cloud, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Badge, Button, Card, SectionTitle } from '../ui/ui';
import TaxpayerForm from './TaxpayerForm';
import PropertyForm from './PropertyForm';

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
    removeTaxpayer,
    addProperty,
    removeProperty,
  } = useStore();

  const [showTaxpayerForm, setShowTaxpayerForm] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(false);

  const active = taxpayers.find((tp) => tp.fiscalCode === activeFiscalCode) ?? taxpayers[0];
  const activeProperties = properties.filter((p) => p.taxpayerFiscalCode === active?.fiscalCode);

  const providerLabel = user?.provider === 'microsoft' ? 'OneDrive' : 'Google Drive';

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
              onSave={(tp) => {
                addTaxpayer(tp);
                setActiveFiscalCode(tp.fiscalCode);
                setShowTaxpayerForm(false);
              }}
              onCancel={() => setShowTaxpayerForm(false)}
            />
          </Card>
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
            {!showPropertyForm && (
              <Button variant="secondary" onClick={() => setShowPropertyForm(true)}>
                <Plus className="w-4 h-4" />
                {t('property.add')}
              </Button>
            )}
          </div>

          {showPropertyForm && (
            <Card className="p-4 mb-3">
              <PropertyForm
                taxpayerFiscalCode={active.fiscalCode}
                onSave={(p) => {
                  addProperty(p);
                  setShowPropertyForm(false);
                }}
                onCancel={() => setShowPropertyForm(false)}
              />
            </Card>
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
