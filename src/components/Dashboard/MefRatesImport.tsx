import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Building2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Upload,
  Pencil,
  Eye,
  ShieldCheck,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  fetchComuneResolutions,
  fetchComuneYear,
  isMefConfigured,
  regionSlug,
  type MefYearResult,
} from '../../lib/mef/mef';
import { searchAliquotaOnline, isMefSearchConfigured } from '../../lib/mef/search';
import { interpretAliquote } from '../../services/ai';
import { isAiConfigured } from '../../services/aiClient';
import { loadComuni, findByCatastale, type Comune } from '../../lib/comuni/comuni';
import { ensurePropertyFolders, uploadFile, downloadFileBlob } from '../../services/storage';
import { computeImu, isMainHomeExempt } from '../../lib/imu/engine';
import { Badge, Button, Card, Input } from '../ui/ui';
import type { Property, MunicipalRateYear, PropertyFolders } from '../../types';

interface Props {
  property: Property;
  onClose: () => void;
}

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function MefRatesImport({ property, onClose }: Props) {
  const { t } = useTranslation();
  const { user, settings, updateProperty } = useStore();

  const [rates, setRates] = useState<Record<number, MunicipalRateYear>>({
    ...(property.ratesByYear ?? {}),
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // Per-year inline editor / upload state
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [draftPerMille, setDraftPerMille] = useState('');
  const [draftDeduction, setDraftDeduction] = useState('');
  const [uploadingYear, setUploadingYear] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [refreshingYear, setRefreshingYear] = useState<number | null>(null);
  const [searchingYear, setSearchingYear] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetYear = useRef<number | null>(null);
  const foldersRef = useRef<PropertyFolders | null>(null);
  const comuneRef = useRef<Comune | null>(null);

  const aiOk = isAiConfigured(settings);
  const mefOk = isMefConfigured();
  const searchOk = isMefSearchConfigured();
  const fromYear = property.acquisitionDate
    ? new Date(property.acquisitionDate).getFullYear()
    : new Date().getFullYear();
  const toYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = fromYear; y <= toYear; y++) years.push(y);

  const exemptMainHome = isMainHomeExempt(property.usageType, property.category);

  const getFolders = async (): Promise<PropertyFolders> => {
    if (foldersRef.current) return foldersRef.current;
    if (!user) throw new Error(t('dashboard.notConnected'));
    const propertyKey = `${property.municipalityCode}_${property.id}`;
    const f = await ensurePropertyFolders(user, property.taxpayerFiscalCode, propertyKey);
    foldersRef.current = f;
    return f;
  };

  const getComune = async (): Promise<Comune | undefined> => {
    if (comuneRef.current) return comuneRef.current;
    const comuni = await loadComuni();
    const c = findByCatastale(comuni, property.municipalityCode);
    if (c) comuneRef.current = c;
    return c;
  };

  const persistRates = async (next: Record<number, MunicipalRateYear>) => {
    setRates(next);
    updateProperty(property.id, { ratesByYear: next });
    if (!user) return;
    try {
      const folders = await getFolders();
      await uploadFile(
        user,
        'property.json',
        JSON.stringify(
          { ...property, ratesByYear: next, updatedAt: new Date().toISOString() },
          null,
          2
        ),
        'application/json',
        folders.propertyFolderId
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  /** Live IMU computation for a given year, using that year's rate. */
  const computeYear = (year: number) => {
    const r = rates[year];
    const perMille = r?.perMille ?? r?.perMilleByUsage?.[property.usageType];
    let amountDue: number | undefined;
    if (perMille != null && property.cadastralIncome) {
      const res = computeImu({
        cadastralIncome: property.cadastralIncome,
        category: property.category,
        aliquotaPerMille: perMille,
        ownershipShare: property.ownershipShare,
        monthsOwned: property.monthsOwned,
        usage: property.usageType,
        deduction: r?.deduction,
      });
      amountDue = res.amountDue;
    }
    return { rate: r, perMille, theoretical: amountDue, due: exemptMainHome ? 0 : amountDue };
  };

  // ── Bulk import from MEF ──────────────────────────────────────────────────
  const runBulk = async () => {
    if (!user || !settings) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setProgress(0);
    try {
      const comuni = await loadComuni();
      const comune: Comune | undefined = findByCatastale(comuni, property.municipalityCode);
      if (!comune) {
        setError(t('mef.noComune'));
        setBusy(false);
        return;
      }
      if (!regionSlug(comune.regione)) {
        const next = { ...rates };
        next[toYear] = { year: toYear, status: 'region_unavailable', note: comune.regione };
        await persistRates(next);
        setDone(true);
        setBusy(false);
        return;
      }

      const folders = await getFolders();
      const next: Record<number, MunicipalRateYear> = { ...rates };
      let count = 0;

      await fetchComuneResolutions(
        property.municipalityCode,
        comune.regione,
        fromYear,
        toYear,
        async (res: MefYearResult) => {
          if (res.status === 'found' && res.docs[0]) {
            const doc = res.docs[0];
            try {
              const file = new File([doc.blob], doc.filename, { type: 'application/pdf' });
              const driveFileId = await uploadFile(
                user,
                doc.filename,
                doc.blob,
                'application/pdf',
                folders.ratesId
              );
              const ali = await interpretAliquote(file, res.year, settings);
              next[res.year] = {
                year: res.year,
                perMille: ali.perMilleByUsage[property.usageType],
                perMilleByUsage: ali.perMilleByUsage,
                deduction: ali.deduction,
                status: 'found',
                sourceFile: doc.filename,
                driveFileId,
              };
            } catch (e) {
              next[res.year] = {
                year: res.year,
                status: 'error',
                note: e instanceof Error ? e.message : 'Error',
                sourceFile: doc.filename,
              };
            }
          } else if (!next[res.year] || next[res.year].status !== 'found') {
            next[res.year] = { year: res.year, status: res.status, note: res.message };
          }
          count++;
          setProgress(Math.round((count / years.length) * 100));
          // Persist each year immediately to the store (and thus localStorage),
          // so a refresh never loses an already-extracted year.
          const snapshot = { ...next };
          setRates(snapshot);
          updateProperty(property.id, { ratesByYear: snapshot });
        }
      );

      // Carry forward: a comune's rates stay in force until a new delibera changes
      // them, so fill 'not_found' years with the most recent earlier found rate.
      let lastFound: MunicipalRateYear | null = null;
      for (let y = fromYear; y <= toYear; y++) {
        const cur = next[y];
        if (cur && (cur.status === 'found') && cur.perMille != null) {
          lastFound = cur;
        } else if (lastFound && (!cur || cur.status === 'not_found')) {
          next[y] = {
            year: y,
            perMille: lastFound.perMille,
            perMilleByUsage: lastFound.perMilleByUsage,
            deduction: lastFound.deduction,
            status: 'inherited',
            inheritedFrom: lastFound.year,
            sourceFile: lastFound.sourceFile,
            driveFileId: lastFound.driveFileId,
          };
        }
      }

      await persistRates(next);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // ── Per-year manual edit ──────────────────────────────────────────────────
  const startEdit = (year: number) => {
    const r = rates[year];
    setEditingYear(year);
    setDraftPerMille(r?.perMille != null ? String(r.perMille) : '');
    setDraftDeduction(r?.deduction != null ? String(r.deduction) : '');
  };

  const saveEdit = async (year: number) => {
    const perMille = draftPerMille.trim() ? Number(draftPerMille.replace(',', '.')) : undefined;
    const deduction = draftDeduction.trim() ? Number(draftDeduction.replace(',', '.')) : undefined;
    const prev = rates[year];
    const next = { ...rates };
    next[year] = {
      ...prev,
      year,
      perMille,
      deduction,
      status: perMille != null ? 'found' : (prev?.status ?? 'not_found'),
      note: t('mef.manualNote'),
    };
    setEditingYear(null);
    await persistRates(next);
  };

  // ── Per-year AI upload of the comune resolution ───────────────────────────
  const pickFile = (year: number) => {
    uploadTargetYear.current = year;
    fileInputRef.current?.click();
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const year = uploadTargetYear.current;
    if (!file || year == null || !user || !settings) return;
    setUploadingYear(year);
    setError(null);
    try {
      const folders = await getFolders();
      const driveFileId = await uploadFile(
        user,
        file.name,
        file,
        file.type || 'application/octet-stream',
        folders.ratesId
      );
      const ali = await interpretAliquote(file, year, settings);
      const next = { ...rates };
      next[year] = {
        year,
        perMille: ali.perMilleByUsage[property.usageType],
        perMilleByUsage: ali.perMilleByUsage,
        deduction: ali.deduction,
        status: 'found',
        sourceFile: file.name,
        driveFileId,
      };
      await persistRates(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setUploadingYear(null);
    }
  };

  // ── Per-year refresh from MEF (force re-fetch a single year) ──────────────
  const refreshYear = async (year: number) => {
    if (!user || !settings) return;
    setRefreshingYear(year);
    setError(null);
    try {
      const comune = await getComune();
      if (!comune) {
        setError(t('mef.noComune'));
        return;
      }
      const res = await fetchComuneYear(property.municipalityCode, comune.regione, year);
      const next = { ...rates };
      if (res.status === 'found' && res.docs[0]) {
        const folders = await getFolders();
        const doc = res.docs[0];
        const file = new File([doc.blob], doc.filename, { type: 'application/pdf' });
        const driveFileId = await uploadFile(
          user,
          doc.filename,
          doc.blob,
          'application/pdf',
          folders.ratesId
        );
        const ali = await interpretAliquote(file, year, settings);
        next[year] = {
          year,
          perMille: ali.perMilleByUsage[property.usageType],
          perMilleByUsage: ali.perMilleByUsage,
          deduction: ali.deduction,
          status: 'found',
          sourceFile: doc.filename,
          driveFileId,
        };
      } else {
        next[year] = { year, status: res.status, note: res.message };
      }
      await persistRates(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setRefreshingYear(null);
    }
  };

  // ── Per-year online search fallback (keyless web search + AI) ─────────────
  const searchYear = async (year: number) => {
    if (!user || !settings) return;
    setSearchingYear(year);
    setError(null);
    try {
      const comune = await getComune();
      const res = await searchAliquotaOnline(
        settings,
        comune?.name ?? property.municipality,
        comune?.sigla ?? '',
        year,
        property.usageType
      );
      const next = { ...rates };
      if (!res.notFound && res.perMille != null) {
        next[year] = {
          year,
          perMille: res.perMille,
          deduction: res.deduction,
          status: 'web',
          sourceUrl: res.sourceUrl,
          note: res.explanation,
        };
      } else {
        next[year] = {
          year,
          status: 'not_found',
          note: res.explanation || t('mef.searchNoResult'),
        };
      }
      await persistRates(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSearchingYear(null);
    }
  };

  // ── View a saved resolution PDF from Drive ────────────────────────────────
  const viewDoc = async (driveFileId: string) => {
    if (!user) return;
    setViewingId(driveFileId);
    try {
      const blob = await downloadFileBlob(user, driveFileId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setViewingId(null);
    }
  };

  const statusBadge = (r?: MunicipalRateYear) => {
    if (!r) return <Badge tone="slate">{t('mef.row.not_found')}</Badge>;
    if (r.status === 'found' && r.note === t('mef.manualNote'))
      return <Badge tone="sky">{t('mef.source.manual')}</Badge>;
    if (r.status === 'inherited')
      return <Badge tone="sky">{t('mef.row.inherited', { year: r.inheritedFrom })}</Badge>;
    if (r.status === 'web') return <Badge tone="sky">{t('mef.row.web')}</Badge>;
    const tone =
      r.status === 'found'
        ? 'green'
        : r.status === 'not_found'
          ? 'amber'
          : r.status === 'region_unavailable'
            ? 'slate'
            : 'red';
    return <Badge tone={tone}>{t(`mef.row.${r.status}` as Parameters<typeof t>[0])}</Badge>;
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-sky-500" />
          <h3 className="font-semibold">{t('mef.panelTitle')}</h3>
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('mef.panelHint', { from: fromYear, to: toYear })}
      </p>

      {exemptMainHome && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm px-3 py-2 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('mef.mainHomeExempt')}</span>
        </div>
      )}

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

      <Button type="button" onClick={runBulk} disabled={busy || !mefOk || !aiOk} className="w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
        {busy
          ? progress != null
            ? `${t('mef.running')} ${progress}%`
            : t('mef.running')
          : t('mef.run')}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Per-year rows: rate, live IMU, source doc, actions */}
      <div className="space-y-2">
        {years.map((year) => {
          const c = computeYear(year);
          const r = c.rate;
          const isEditing = editingYear === year;
          return (
            <div
              key={year}
              className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-sm font-bold w-12 shrink-0">{year}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(r)}
                      {c.perMille != null && (
                        <span className="text-xs font-mono text-slate-500">{c.perMille} ‰</span>
                      )}
                    </div>
                    {r?.sourceFile && (
                      <button
                        type="button"
                        onClick={() => r.driveFileId && viewDoc(r.driveFileId)}
                        disabled={!r.driveFileId || viewingId === r.driveFileId}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50 disabled:no-underline truncate max-w-[200px]"
                        title={r.sourceFile}
                      >
                        {viewingId === r.driveFileId ? (
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        ) : (
                          <FileText className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{r.sourceFile}</span>
                        {r.driveFileId && <Eye className="w-3 h-3 shrink-0" />}
                      </button>
                    )}
                    {r?.sourceUrl && !r.sourceFile && (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[200px]"
                        title={r.sourceUrl}
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{t('mef.webSource')}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Live IMU amount */}
                  <div className="text-right">
                    {c.perMille == null ? (
                      <span className="text-sm text-slate-400">—</span>
                    ) : c.theoretical == null ? (
                      <span className="text-xs text-amber-600">{t('mef.needsIncome')}</span>
                    ) : exemptMainHome ? (
                      <div className="leading-tight">
                        <span className="text-xs text-slate-400 line-through">
                          {euro.format(c.theoretical)}
                        </span>
                        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {euro.format(0)}
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          {t('mef.exempt')}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm font-bold">{euro.format(c.due ?? 0)}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => refreshYear(year)}
                      disabled={refreshingYear === year || !mefOk || !aiOk}
                      title={t('mef.refreshYear')}
                      aria-label={t('mef.refreshYear')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-white dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
                    >
                      {refreshingYear === year ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => searchYear(year)}
                      disabled={searchingYear === year || !searchOk || !aiOk}
                      title={searchOk ? t('mef.searchYear') : t('mef.searchProxyMissing')}
                      aria-label={t('mef.searchYear')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
                    >
                      {searchingYear === year ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Globe className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => pickFile(year)}
                      disabled={uploadingYear === year || !aiOk}
                      title={t('mef.uploadDoc')}
                      aria-label={t('mef.uploadDoc')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-white dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
                    >
                      {uploadingYear === year ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingYear(null) : startEdit(year))}
                      title={t('mef.editRate')}
                      aria-label={t('mef.editRate')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline manual editor */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      {t('calculation.rate')}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={draftPerMille}
                      onChange={(e) => setDraftPerMille(e.target.value)}
                      placeholder="10.6"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      {t('calculation.deduction')}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={draftDeduction}
                      onChange={(e) => setDraftDeduction(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <Button type="button" onClick={() => saveEdit(year)}>
                    <CheckCircle2 className="w-4 h-4" />
                    {t('common.save')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          {t('mef.done')}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={onFilePicked}
      />
    </Card>
  );
}
