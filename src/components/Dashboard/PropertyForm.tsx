import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2 } from 'lucide-react';
import type { Property, PropertyUsage } from '../../types';
import { uid } from '../../lib/utils';
import { Button, Field, Input, Select } from '../ui/ui';
import ComuneAutocomplete from '../ui/ComuneAutocomplete';
import { loadComuni, findByName } from '../../lib/comuni/comuni';

interface Props {
  taxpayerFiscalCode: string;
  initial?: Partial<Property>;
  onSave: (p: Property) => void;
  onCancel?: () => void;
}

const USAGES: PropertyUsage[] = [
  'main_home',
  'other_building',
  'land',
  'buildable_area',
  'appurtenance',
];

export default function PropertyForm({ taxpayerFiscalCode, initial, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const now = new Date().toISOString();
  const [form, setForm] = useState<Partial<Property>>({
    ownershipShare: 100,
    monthsOwned: 12,
    usageType: 'other_building',
    ...initial,
  });

  const set = (k: keyof Property, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookupCode = async () => {
    if (!form.municipality?.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const list = await loadComuni();
      const match = findByName(list, form.municipality);
      if (match?.catastale) {
        setForm((f) => ({ ...f, municipality: match.name, municipalityCode: match.catastale }));
      } else {
        setLookupError(t('property.codeNotFound'));
      }
    } catch {
      setLookupError(t('property.codeLookupError'));
    } finally {
      setLookingUp(false);
    }
  };

  const submit = () => {
    if (!form.label || !form.municipalityCode) {
      setError(t('property.requiredHint'));
      return;
    }
    setError(null);
    onSave({
      id: initial?.id ?? uid('prop'),
      taxpayerFiscalCode,
      label: form.label.trim(),
      municipality: form.municipality?.trim() ?? '',
      municipalityCode: form.municipalityCode.toUpperCase().trim(),
      category: form.category?.toUpperCase().trim(),
      cadastralIncome: form.cadastralIncome ? Number(form.cadastralIncome) : undefined,
      ownershipShare: Number(form.ownershipShare ?? 100),
      monthsOwned: Number(form.monthsOwned ?? 12),
      usageType: form.usageType as PropertyUsage,
      isMainHome: form.usageType === 'main_home',
      acquisitionDate: form.acquisitionDate,
      disposalDate: form.disposalDate,
      notes: form.notes,
      status: initial?.status ?? 'to_verify',
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      drivePropertyFileId: initial?.drivePropertyFileId,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('property.label')}>
          <Input value={form.label ?? ''} onChange={(e) => set('label', e.target.value)} placeholder="Casa al mare" />
        </Field>
        <Field label={t('property.usageType')}>
          <Select value={form.usageType ?? 'other_building'} onChange={(e) => set('usageType', e.target.value)}>
            {USAGES.map((u) => (
              <option key={u} value={u}>
                {t(`property.usage.${u}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('property.municipality')}>
          <ComuneAutocomplete
            value={form.municipality ?? ''}
            placeholder="Roma"
            onChange={(text) => set('municipality', text)}
            onSelect={(c) =>
              setForm((f) => ({
                ...f,
                municipality: c.name,
                municipalityCode: c.catastale,
              }))
            }
          />
        </Field>
        <Field label={t('property.municipalityCode')}>
          <div className="flex gap-2">
            <Input
              value={form.municipalityCode ?? ''}
              onChange={(e) => set('municipalityCode', e.target.value.toUpperCase())}
              placeholder="H501"
              autoCapitalize="characters"
              className="flex-1"
            />
            <button
              type="button"
              onClick={lookupCode}
              disabled={lookingUp || !form.municipality?.trim()}
              title={t('property.findCode')}
              aria-label={t('property.findCode')}
              className="shrink-0 inline-flex items-center justify-center rounded-xl px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
          {lookupError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">{lookupError}</p>}
        </Field>
        <Field label={t('property.category')}>
          <Input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="A/2" />
        </Field>
        <Field label={t('property.cadastralIncome')}>
          <Input
            type="number"
            step="0.01"
            value={form.cadastralIncome ?? ''}
            onChange={(e) => set('cadastralIncome', e.target.value)}
          />
        </Field>
        <Field label={t('property.ownershipShare')}>
          <Input
            type="number"
            value={form.ownershipShare ?? 100}
            onChange={(e) => set('ownershipShare', e.target.value)}
          />
        </Field>
        <Field label={t('property.monthsOwned')}>
          <Input
            type="number"
            value={form.monthsOwned ?? 12}
            onChange={(e) => set('monthsOwned', e.target.value)}
          />
        </Field>
        <Field label={t('property.acquisitionDate')}>
          <Input
            type="date"
            value={form.acquisitionDate ?? ''}
            onChange={(e) => set('acquisitionDate', e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" onClick={submit}>{t('common.save')}</Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
