import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Sparkles, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Badge, Button, Card, Field, SectionTitle, Select } from '../ui/ui';
import { interpretDocument, type InterpretedDocument } from '../../services/ai';
import { isAiConfigured, SUPPORTED_DOC_ACCEPT } from '../../services/aiClient';
import { ensurePropertyFolders, ensureTaxpayerFolder, uploadFile } from '../../services/storage';
import { uid } from '../../lib/utils';
import type { TaxDocument, TaxDocumentType } from '../../types';

const DOC_TYPES: TaxDocumentType[] = [
  'f24',
  'visura',
  'deed',
  'imu_declaration',
  'receipt',
  'rates_sheet',
  'other',
];

export default function DocumentsPage() {
  const { t } = useTranslation();
  const {
    user,
    settings,
    taxpayers,
    properties,
    documents,
    activeFiscalCode,
    activePropertyId,
    addDocument,
    addExtraction,
  } = useStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<TaxDocumentType>('f24');
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InterpretedDocument | null>(null);

  const taxpayer = taxpayers.find((tp) => tp.fiscalCode === activeFiscalCode) ?? taxpayers[0];
  const property = properties.find((p) => p.id === activePropertyId);

  const aiConfigured = isAiConfigured(settings);

  const analyze = async () => {
    if (!file || !settings || !user || !taxpayer) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // 1. Read + interpret the document directly with the selected AI provider
      const interpreted = await interpretDocument(file, settings);
      setResult(interpreted);

      // 2. Save the document to Drive
      const propertyKey = property ? `${property.municipalityCode}_${property.id}` : null;
      let parentId: string;
      if (propertyKey) {
        const folders = await ensurePropertyFolders(user, taxpayer.fiscalCode, propertyKey);
        parentId = folders.documentsId;
      } else {
        parentId = await ensureTaxpayerFolder(user, taxpayer.fiscalCode);
      }
      const driveFileId = await uploadFile(
        user,
        file.name,
        file,
        file.type || 'application/octet-stream',
        parentId
      );

      const doc: TaxDocument = {
        id: uid('doc'),
        taxpayerFiscalCode: taxpayer.fiscalCode,
        propertyId: property?.id,
        type: docType,
        year: year ? Number(year) : undefined,
        useForExtraction: true,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        driveFileId,
        uploadedAt: new Date().toISOString(),
      };
      addDocument(doc);
      addExtraction({
        id: uid('extr'),
        documentId: doc.id,
        createdAt: new Date().toISOString(),
        documentType: interpreted.documentType,
        confidence: interpreted.confidence,
        taxpayer: interpreted.taxpayer,
        localTaxRows: interpreted.localTaxRows,
        total: interpreted.total,
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('documents.title')}</h1>

      {!taxpayer && (
        <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('dashboard.emptyTaxpayers')}
        </Card>
      )}

      {taxpayer && (
        <Card className="p-4 space-y-3">
          <SectionTitle hint={taxpayer ? `${taxpayer.firstName} ${taxpayer.lastName}` : undefined}>
            {t('documents.upload')}
          </SectionTitle>

          {!aiConfigured && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm px-3 py-2">
              {t('assistant.needsSettings')}
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-8 text-center hover:border-sky-400 transition-colors"
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

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('documents.type')}>
              <Select value={docType} onChange={(e) => setDocType(e.target.value as TaxDocumentType)}>
                {DOC_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {t(`documents.types.${d}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('documents.year')}>
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i + 1).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button
            onClick={analyze}
            disabled={!file || busy || !aiConfigured}
            className="w-full"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? t('documents.analyzing') : t('documents.analyze')}
          </Button>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </Card>
      )}

      {result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>{t('extraction.title')}</SectionTitle>
            <Badge tone="green">
              {t('extraction.confidence')}: {Math.round((result.confidence ?? 0) * 100)}%
            </Badge>
          </div>
          {result.taxpayer && (
            <div className="text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t('extraction.taxpayer')}: </span>
              {result.taxpayer.firstName} {result.taxpayer.lastName}{' '}
              <span className="font-mono text-xs">{result.taxpayer.fiscalCode}</span>
            </div>
          )}
          {result.localTaxRows && result.localTaxRows.length > 0 && (
            <div className="rounded-xl overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">{t('calculation.municipalityCode')}</th>
                    <th className="text-left px-3 py-2">{t('calculation.taxCode')}</th>
                    <th className="text-left px-3 py-2">{t('calculation.year')}</th>
                    <th className="text-right px-3 py-2">{t('calculation.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.localTaxRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 font-mono">{r.municipalityCode}</td>
                      <td className="px-3 py-2 font-mono">{r.taxCode}</td>
                      <td className="px-3 py-2">{r.year}</td>
                      <td className="px-3 py-2 text-right">{r.amountDue?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.total != null && (
            <div className="text-right font-semibold">
              {t('extraction.total')}: {result.total.toFixed(2)} €
            </div>
          )}
          {result.explanation && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {result.explanation}
            </p>
          )}
        </Card>
      )}

      {/* Document history */}
      <div>
        <SectionTitle>{t('documents.title')}</SectionTitle>
        {documents.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('documents.empty')}
          </Card>
        ) : (
          <div className="grid gap-2">
            {documents.map((d) => (
              <Card key={d.id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center">
                  <FileText className="w-4.5 h-4.5 text-sky-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.fileName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t(`documents.types.${d.type}` as Parameters<typeof t>[0])}
                    {d.year ? ` · ${d.year}` : ''}
                  </div>
                </div>
                {d.driveFileId && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
