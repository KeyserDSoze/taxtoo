import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Sparkles, Loader2, Plus, PackageX } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  interpretPropertyDocument,
  type PropertyDocInterpretation,
} from '../../services/ai';
import { isAiConfigured, SUPPORTED_DOC_ACCEPT } from '../../services/aiClient';
import { uid } from '../../lib/utils';
import { Badge, Button, Card, Input } from '../ui/ui';
import type { Property, PropertyUsage } from '../../types';

interface Props {
  taxpayerFiscalCode: string;
  existing: Property[];
  onCreateProperty: (p: Property) => void;
  onMarkSold: (propertyId: string, date?: string) => void;
  onClose: () => void;
}

export default function PropertyImport({
  taxpayerFiscalCode,
  existing,
  onCreateProperty,
  onMarkSold,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { settings } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyDocInterpretation | null>(null);
  const [acqDate, setAcqDate] = useState('');
  const [added, setAdded] = useState<Set<number>>(new Set());

  const aiConfigured = isAiConfigured(settings);

  const analyze = async () => {
    if (!file || !settings) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setAdded(new Set());
    try {
      const interpreted = await interpretPropertyDocument(file, settings);
      setResult(interpreted);
      if (interpreted.date) setAcqDate(interpreted.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const addProperty = (idx: number) => {
    if (!result) return;
    const ep = result.properties[idx];
    const now = new Date().toISOString();
    const property: Property = {
      id: uid('prop'),
      taxpayerFiscalCode,
      label: ep.label?.trim() || ep.municipality || 'Immobile',
      municipality: ep.municipality?.trim() ?? '',
      municipalityCode: (ep.municipalityCode ?? '').toUpperCase().trim(),
      category: ep.category?.toUpperCase().trim(),
      cadastralIncome: ep.cadastralIncome,
      ownershipShare: ep.ownershipShare ?? 100,
      monthsOwned: 12,
      usageType: (ep.usageType as PropertyUsage) ?? 'other_building',
      isMainHome: ep.usageType === 'main_home',
      acquisitionDate: acqDate || undefined,
      notes: undefined,
      status: 'to_verify',
      createdAt: now,
      updatedAt: now,
    };
    onCreateProperty(property);
    setAdded((s) => new Set(s).add(idx));
  };

  // For a sale deed, find existing active properties matching the extracted ones by codice comune.
  const saleMatches =
    result?.deedKind === 'sale'
      ? existing.filter((p) =>
          result.properties.some(
            (ep) =>
              ep.municipalityCode &&
              ep.municipalityCode.toUpperCase().trim() === p.municipalityCode.toUpperCase().trim()
          )
        )
      : [];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('propertyImport.title')}</h3>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('propertyImport.hint')}</p>

      {(!aiConfigured) && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm px-3 py-2">
          {t('assistant.needsSettings')}
        </div>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-6 text-center hover:border-sky-400 transition-colors"
      >
        <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {file ? file.name : t('documents.dropHint')}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={SUPPORTED_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <Button
        type="button"
        onClick={analyze}
        disabled={!file || busy || !aiConfigured}
        className="w-full"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy ? t('documents.analyzing') : t('documents.analyze')}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.deedKind === 'sale' ? 'red' : 'green'}>
              {t(`propertyImport.deed.${result.deedKind}` as Parameters<typeof t>[0])}
            </Badge>
            <Badge tone="sky">
              {t('extraction.confidence')}: {Math.round((result.confidence ?? 0) * 100)}%
            </Badge>
          </div>

          {result.explanation && (
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {result.explanation}
            </p>
          )}

          {/* Date the ownership starts (purchase) */}
          {result.deedKind !== 'sale' && result.properties.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('property.acquisitionDate')}
              </label>
              <Input type="date" value={acqDate} onChange={(e) => setAcqDate(e.target.value)} />
            </div>
          )}

          {/* Extracted properties to add (purchase / visura) */}
          {result.deedKind !== 'sale' &&
            result.properties.map((ep, i) => (
              <Card key={i} className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {ep.label || ep.municipality || t('property.title')}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {ep.municipality} · <span className="font-mono">{ep.municipalityCode}</span>
                    {ep.category ? ` · ${ep.category}` : ''}
                    {ep.cadastralIncome ? ` · €${ep.cadastralIncome}` : ''}
                  </div>
                </div>
                <Button
                  type="button"
                  variant={added.has(i) ? 'secondary' : 'primary'}
                  disabled={added.has(i)}
                  onClick={() => addProperty(i)}
                >
                  <Plus className="w-4 h-4" />
                  {added.has(i) ? t('common.saved') : t('common.add')}
                </Button>
              </Card>
            ))}

          {/* Sale: offer to mark matching properties as sold */}
          {result.deedKind === 'sale' && (
            <div className="space-y-2">
              {saleMatches.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('propertyImport.noSaleMatch')}
                </p>
              ) : (
                saleMatches.map((p) => (
                  <Card key={p.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {p.municipality} · <span className="font-mono">{p.municipalityCode}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => onMarkSold(p.id, result.date)}
                    >
                      <PackageX className="w-4 h-4" />
                      {t('propertyImport.markSold')}
                    </Button>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
