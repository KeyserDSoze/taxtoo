import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Building2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  fetchComuneResolutions,
  isMefConfigured,
  regionSlug,
  type MefYearResult,
} from '../../lib/mef/mef';
import { interpretAliquote } from '../../services/ai';
import { isAiConfigured } from '../../services/aiClient';
import { loadComuni, findByCatastale, type Comune } from '../../lib/comuni/comuni';
import { ensurePropertyFolders, uploadFile } from '../../services/storage';
import { Badge, Button, Card } from '../ui/ui';
import type { Property, MunicipalRateYear } from '../../types';

interface Props {
  property: Property;
  onClose: () => void;
}

type Row = { year: number; status: MunicipalRateYear['status']; message?: string; perMille?: number };

export default function MefRatesImport({ property, onClose }: Props) {
  const { t } = useTranslation();
  const { user, settings, updateProperty } = useStore();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const aiOk = isAiConfigured(settings);
  const mefOk = isMefConfigured();
  const fromYear = property.acquisitionDate
    ? new Date(property.acquisitionDate).getFullYear()
    : new Date().getFullYear();
  const toYear = new Date().getFullYear();

  const run = async () => {
    if (!user || !settings) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setRows([]);
    try {
      const comuni = await loadComuni();
      const comune: Comune | undefined = findByCatastale(comuni, property.municipalityCode);
      if (!comune) {
        setError(t('mef.noComune'));
        setBusy(false);
        return;
      }
      if (!regionSlug(comune.regione)) {
        setRows([
          {
            year: toYear,
            status: 'region_unavailable',
            message: t('mef.regionUnavailable', { region: comune.regione }),
          },
        ]);
        setDone(true);
        setBusy(false);
        return;
      }

      const propertyKey = `${property.municipalityCode}_${property.id}`;
      const folders = await ensurePropertyFolders(user, property.taxpayerFiscalCode, propertyKey);
      const ratesByYear: Record<number, MunicipalRateYear> = { ...(property.ratesByYear ?? {}) };
      const uiRows: Row[] = [];

      await fetchComuneResolutions(
        property.municipalityCode,
        comune.regione,
        fromYear,
        toYear,
        async (res: MefYearResult) => {
          const row: Row = { year: res.year, status: res.status, message: res.message };
          if (res.status === 'found' && res.docs[0]) {
            const doc = res.docs[0];
            try {
              // Save the resolution PDF to Drive under the property's aliquote folder
              const file = new File([doc.blob], doc.filename, { type: 'application/pdf' });
              const driveFileId = await uploadFile(
                user,
                doc.filename,
                doc.blob,
                'application/pdf',
                folders.ratesId
              );
              // Extract the rates with AI
              const ali = await interpretAliquote(file, res.year, settings);
              const perMille = ali.perMilleByUsage[property.usageType];
              ratesByYear[res.year] = {
                year: res.year,
                perMille,
                perMilleByUsage: ali.perMilleByUsage,
                deduction: ali.deduction,
                status: 'found',
                sourceFile: doc.filename,
                driveFileId,
              };
              row.perMille = perMille;
            } catch (e) {
              row.status = 'error';
              row.message = e instanceof Error ? e.message : 'Error';
              ratesByYear[res.year] = { year: res.year, status: 'error', sourceFile: doc.filename };
            }
          } else {
            ratesByYear[res.year] = { year: res.year, status: res.status, note: res.message };
          }
          uiRows.push(row);
          setRows([...uiRows].sort((a, b) => a.year - b.year));
        }
      );

      updateProperty(property.id, { ratesByYear });
      // Persist updated property.json
      await uploadFile(
        user,
        'property.json',
        JSON.stringify({ ...property, ratesByYear, updatedAt: new Date().toISOString() }, null, 2),
        'application/json',
        folders.propertyFolderId
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const badgeFor = (s: Row['status']) =>
    s === 'found' ? 'green' : s === 'not_found' ? 'amber' : s === 'region_unavailable' ? 'slate' : 'red';

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-sky-500" />
          <h3 className="font-semibold">{t('mef.title')}</h3>
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('mef.hint', { from: fromYear, to: toYear })}
      </p>

      {!mefOk && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {t('mef.proxyMissing')}
        </div>
      )}
      {!aiOk && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm px-3 py-2">
          {t('assistant.needsSettings')}
        </div>
      )}

      <Button type="button" onClick={run} disabled={busy || !mefOk || !aiOk} className="w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
        {busy ? t('mef.running') : t('mef.run')}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {rows.length > 0 && (
        <div className="rounded-xl overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">{t('calculation.year')}</th>
                <th className="text-left px-3 py-2">{t('mef.status')}</th>
                <th className="text-right px-3 py-2">{t('calculation.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{r.year}</td>
                  <td className="px-3 py-2">
                    <Badge tone={badgeFor(r.status)}>{t(`mef.row.${r.status}` as Parameters<typeof t>[0])}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.perMille != null ? `${r.perMille} ‰` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          {t('mef.done')}
        </div>
      )}
    </Card>
  );
}
