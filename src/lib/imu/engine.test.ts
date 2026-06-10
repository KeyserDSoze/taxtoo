import { describe, it, expect } from 'vitest';
import {
  computeImu,
  coefficientForCategory,
  splitInstallments,
  buildF24Rows,
  REVALUATION,
} from './engine';

describe('coefficientForCategory', () => {
  it('resolves exact categories', () => {
    expect(coefficientForCategory('C/1')).toBe(55);
    expect(coefficientForCategory('A/10')).toBe(80);
    expect(coefficientForCategory('D/5')).toBe(80);
  });
  it('falls back to the group coefficient', () => {
    expect(coefficientForCategory('A/2')).toBe(160);
    expect(coefficientForCategory('D/1')).toBe(65);
    expect(coefficientForCategory('B/4')).toBe(140);
  });
  it('defaults to 160 when unknown/empty', () => {
    expect(coefficientForCategory(undefined)).toBe(160);
    expect(coefficientForCategory('Z/9')).toBe(160);
  });
});

describe('computeImu', () => {
  it('computes base imponibile, annual tax and amount due', () => {
    const res = computeImu({
      cadastralIncome: 1000,
      category: 'A/2',
      aliquotaPerMille: 10.6,
      ownershipShare: 100,
      monthsOwned: 12,
      usage: 'other_building',
    });
    // base = 1000 * 1.05 * 160 = 168000
    expect(res.taxableBase).toBe(1000 * REVALUATION * 160);
    // annual = 168000 * 0.0106 = 1780.8
    expect(res.annualTax).toBeCloseTo(1780.8, 2);
    expect(res.amountDue).toBeCloseTo(1780.8, 2);
    expect(res.taxCode).toBe('3918');
  });

  it('prorates by ownership share and months', () => {
    const res = computeImu({
      cadastralIncome: 1000,
      category: 'A/2',
      aliquotaPerMille: 10,
      ownershipShare: 50,
      monthsOwned: 6,
      usage: 'other_building',
    });
    // annual = 168000 * 0.01 = 1680 ; due = 1680 * 0.5 * 0.5 = 420
    expect(res.amountDue).toBeCloseTo(420, 2);
  });

  it('flags warnings on missing data', () => {
    const res = computeImu({
      cadastralIncome: 0,
      aliquotaPerMille: 0,
      ownershipShare: 0,
      monthsOwned: 13,
      usage: 'other_building',
    });
    expect(res.warnings).toContain('missingCadastralIncome');
    expect(res.warnings).toContain('missingRate');
    expect(res.warnings).toContain('invalidOwnershipShare');
    expect(res.warnings).toContain('invalidMonths');
  });
});

describe('splitInstallments', () => {
  it('splits to acconto + saldo rounded to euro', () => {
    const r = splitInstallments(59);
    expect(r.total).toBe(59);
    expect(r.acconto + r.saldo).toBe(59);
  });
});

describe('buildF24Rows', () => {
  it('groups amounts by tax code and rounds to euro', () => {
    const rows = buildF24Rows([
      { taxCode: '3916', amountDue: 35 },
      { taxCode: '3918', amountDue: 24 },
      { taxCode: '3918', amountDue: 0.4 },
    ]);
    const byCode = Object.fromEntries(rows.map((r) => [r.taxCode, r.amount]));
    expect(byCode['3916']).toBe(35);
    expect(byCode['3918']).toBe(24); // 24.4 → 24
  });
});
