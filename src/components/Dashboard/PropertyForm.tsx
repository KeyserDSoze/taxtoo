import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Property, PropertyUsage } from '../../types';
import { uid } from '../../lib/utils';
import { Button, Field, Input, Select } from '../ui/ui';

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
          <Input value={form.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} placeholder="Roma" />
        </Field>
        <Field label={t('property.municipalityCode')}>
          <Input
            value={form.municipalityCode ?? ''}
            onChange={(e) => set('municipalityCode', e.target.value)}
            placeholder="H501"
            autoCapitalize="characters"
          />
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
