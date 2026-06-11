import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Taxpayer } from '../../types';
import { Button, Field, Input, Select } from '../ui/ui';

interface Props {
  initial?: Partial<Taxpayer>;
  onSave: (t: Taxpayer) => void;
  onCancel?: () => void;
}

export default function TaxpayerForm({ initial, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const now = new Date().toISOString();
  const [form, setForm] = useState<Partial<Taxpayer>>({
    sex: 'M',
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Taxpayer, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const missing: string[] = [];
    if (!form.fiscalCode) missing.push(t('taxpayer.fiscalCode'));
    if (!form.firstName) missing.push(t('taxpayer.firstName'));
    if (!form.lastName) missing.push(t('taxpayer.lastName'));
    if (!form.fiscalCode || !form.firstName || !form.lastName) {
      setError(`${t('taxpayer.requiredHint')} (${missing.join(', ')})`);
      return;
    }
    setError(null);
    onSave({
      fiscalCode: form.fiscalCode.toUpperCase().trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      birthDate: form.birthDate,
      birthPlace: form.birthPlace,
      birthProvince: form.birthProvince,
      sex: form.sex as Taxpayer['sex'],
      domicileMunicipality: form.domicileMunicipality,
      domicileProvince: form.domicileProvince,
      address: form.address,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      driveProfileFileId: initial?.driveProfileFileId,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('taxpayer.fiscalCode')}>
          <Input
            value={form.fiscalCode ?? ''}
            onChange={(e) => set('fiscalCode', e.target.value)}
            placeholder="MRARSS80A01H501Z"
            autoCapitalize="characters"
          />
        </Field>
        <Field label={t('taxpayer.sex')}>
          <Select value={form.sex ?? 'M'} onChange={(e) => set('sex', e.target.value)}>
            <option value="M">{t('taxpayer.sexM')}</option>
            <option value="F">{t('taxpayer.sexF')}</option>
          </Select>
        </Field>
        <Field label={t('taxpayer.firstName')}>
          <Input value={form.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} />
        </Field>
        <Field label={t('taxpayer.lastName')}>
          <Input value={form.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label={t('taxpayer.birthDate')}>
          <Input type="date" value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>
        <Field label={t('taxpayer.birthPlace')}>
          <Input value={form.birthPlace ?? ''} onChange={(e) => set('birthPlace', e.target.value)} />
        </Field>
        <Field label={t('taxpayer.domicileMunicipality')}>
          <Input
            value={form.domicileMunicipality ?? ''}
            onChange={(e) => set('domicileMunicipality', e.target.value)}
          />
        </Field>
        <Field label={t('taxpayer.address')}>
          <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" onClick={submit}>{t('taxpayer.save')}</Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
