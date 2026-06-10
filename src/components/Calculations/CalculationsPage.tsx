import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Save, Download, Sparkles } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Badge, Button, Card, Field, Input, SectionTitle, Select } from '../ui/ui';
import {
  computeImu,
  buildF24Rows,
  splitInstallments,
  IMU_ENGINE_VERSION,
} from '../../lib/imu';
import { generateF24Pdf } from '../../lib/f24/generateF24';
import { generateSummary } from '../../services/azureOpenAI';
import { ensurePropertyFolders, uploadFile } from '../../services/storage';
import { uid, formatCurrency } from '../../lib/utils';
import type { TaxCalculation, F24 } from '../../types';

export default function CalculationsPage() {
  const { t } = useTranslation();
  const {
    user,
    settings,
    taxpayers,
    properties,
    calculations,
    activeFiscalCode,
    addCalculation,
    addF24,
  } = useStore();

  const taxpayer = taxpayers.find((tp) => tp.fiscalCode === activeFiscalCode) ?? taxpayers[0];
  const myProperties = properties.filter((p) => p.taxpayerFiscalCode === taxpayer?.fiscalCode);

  const [propertyId, setPropertyId] = useState<string>(myProperties[0]?.id ?? '');
  const [year, setYear] = useState(new Date().getFullYear());
  const [rate, setRate] = useState('10.6');
  const [deduction, setDeduction] = useState('0');
  const [savedCalc, setSavedCalc] = useState<TaxCalculation | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'f24' | 'summary'>(null);
  const [error, setError] = useState<string | null>(null);

  const property = myProperties.find((p) => p.id === propertyId);

  const result = useMemo(() => {
    if (!property) return null;
    return computeImu({
      cadastralIncome: property.cadastralIncome ?? 0,
      category: property.category,
      aliquotaPerMille: Number(rate) || 0,
      ownershipShare: property.ownershipShare,
      monthsOwned: property.monthsOwned,
      usage: property.usageType,
      deduction: Number(deduction) || 0,
    });
  }, [property, rate, deduction]);

  const rows = result ? buildF24Rows([{ taxCode: result.taxCode, amountDue: result.amountDue }]) : [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const installments = splitInstallments(result?.amountDue ?? 0);

  const aiConfigured = !!settings?.azureOpenAIEndpoint && !!settings?.azureOpenAIKey;

  const buildCalculation = (): TaxCalculation => ({
    id: savedCalc?.id ?? uid('imu'),
    taxpayerFiscalCode: taxpayer!.fiscalCode,
    propertyId: property!.id,
    taxType: 'IMU',
    year,
    municipalityCode: property!.municipalityCode,
    rows,
    total,
    engineVersion: IMU_ENGINE_VERSION,
    inputSources: [property!.label, 'manual rate input'],
    manualOverrides: [`aliquota ${rate}‰`, ...(Number(deduction) ? [`detrazione ${deduction}`] : [])],
    status: 'draft',
    createdAt: savedCalc?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!user || !property || !taxpayer) return;
    setBusy('save');
    setError(null);
    try {
      const calc = { ...buildCalculation(), status: 'user_confirmed' as const };
      const propertyKey = `${property.municipalityCode}_${property.id}`;
      const folders = await ensurePropertyFolders(user, taxpayer.fiscalCode, propertyKey);
      const fileId = await uploadFile(
        user,
        `imu_${year}.json`,
        JSON.stringify(calc, null, 2),
        'application/json',
        folders.calculationsId
      );
      const stored = { ...calc, driveFileId: fileId };
      addCalculation(stored);
      setSavedCalc(stored);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const makeF24 = async () => {
    if (!property || !taxpayer) return;
    setBusy('f24');
    setError(null);
    try {
      const calc = savedCalc ?? buildCalculation();
      const blob = await generateF24Pdf(calc, taxpayer);

      // Download locally
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `f24_imu_${year}_${property.municipalityCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Save to Drive
      if (user) {
        const propertyKey = `${property.municipalityCode}_${property.id}`;
        const folders = await ensurePropertyFolders(user, taxpayer.fiscalCode, propertyKey);
        const driveFileId = await uploadFile(
          user,
          `f24_imu_${year}_${property.municipalityCode}.pdf`,
          blob,
          'application/pdf',
          folders.f24Id
        );
        const f24: F24 = {
          id: uid('f24'),
          calculationId: calc.id,
          kind: 'unico',
          fileName: `f24_imu_${year}_${property.municipalityCode}.pdf`,
          driveFileId,
          generatedAt: new Date().toISOString(),
        };
        addF24(f24);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const makeSummary = async () => {
    if (!settings || !aiConfigured) return;
    setBusy('summary');
    setError(null);
    try {
      const calc = savedCalc ?? buildCalculation();
      const text = await generateSummary(JSON.stringify(calc), settings);
      setSummary(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  if (!taxpayer) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('dashboard.emptyTaxpayers')}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('calculation.title')}</h1>

      {myProperties.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('property.empty')}
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('property.title')}>
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {myProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.municipalityCode}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('calculation.year')}>
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i + 1).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('calculation.rate')}>
              <Input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
            <Field label={t('calculation.deduction')}>
              <Input type="number" step="0.01" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            </Field>
          </div>

          {result && result.warnings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.warnings.map((w) => (
                <Badge key={w} tone="red">
                  {t(`calculation.warnings.${w}` as Parameters<typeof t>[0])}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {result && property && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500">{t('calculation.taxableBase')}</div>
              <div className="font-semibold">{formatCurrency(result.taxableBase)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('calculation.annualTax')}</div>
              <div className="font-semibold">{formatCurrency(result.annualTax)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('calculation.total')}</div>
              <div className="font-bold text-sky-600 dark:text-sky-400">{formatCurrency(total)}</div>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">{t('calculation.municipalityCode')}</th>
                  <th className="text-left px-3 py-2">{t('calculation.taxCode')}</th>
                  <th className="text-right px-3 py-2">{t('calculation.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.taxCode} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono">{property.municipalityCode}</td>
                    <td className="px-3 py-2 font-mono">{r.taxCode}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-4 text-sm text-slate-500">
            <span>
              {t('calculation.acconto')}: <b className="text-slate-700 dark:text-slate-200">{formatCurrency(installments.acconto)}</b>
            </span>
            <span>
              {t('calculation.saldo')}: <b className="text-slate-700 dark:text-slate-200">{formatCurrency(installments.saldo)}</b>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy !== null}>
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('calculation.save')}
            </Button>
            <Button variant="secondary" onClick={makeF24} disabled={busy !== null}>
              {busy === 'f24' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('calculation.generateF24')}
            </Button>
            <Button variant="ghost" onClick={makeSummary} disabled={busy !== null || !aiConfigured}>
              {busy === 'summary' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t('calculation.generateSummary')}
            </Button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {summary && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3 text-sm whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          )}
        </Card>
      )}

      {/* Saved calculations */}
      <div>
        <SectionTitle>{t('dashboard.calculations')}</SectionTitle>
        {calculations.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('calculation.empty')}
          </Card>
        ) : (
          <div className="grid gap-2">
            {calculations.map((c) => (
              <Card key={c.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                    <FileText className="w-4.5 h-4.5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      IMU {c.year} · <span className="font-mono">{c.municipalityCode}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {formatCurrency(c.total)}
                    </div>
                  </div>
                </div>
                <Badge tone={c.status === 'user_confirmed' ? 'green' : 'amber'}>
                  {t(`calculation.status.${c.status}` as Parameters<typeof t>[0])}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
