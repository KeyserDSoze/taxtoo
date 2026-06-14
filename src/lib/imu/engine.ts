/**
 * Deterministic IMU calculation engine — pure TypeScript, no AI, fully unit-testable.
 *
 * IMU on buildings:
 *   base imponibile = rendita catastale × 1.05 (rivalutazione) × coefficiente categoria
 *   imposta annua   = base imponibile × (aliquota ‰ / 1000)
 *   quota dovuta    = imposta annua × (mesi/12) × (quota possesso/100) − detrazioni
 *
 * Amounts are rounded to 2 decimals during computation; F24 line amounts are rounded
 * to the nearest euro per IMU rules (`roundToEuro`).
 *
 * This engine intentionally takes explicit inputs (aliquota, coefficiente) so it stays
 * independent of any per-comune rates lookup, which is provided separately.
 */

import { taxCodeForUsage } from './taxCodes';
import type { CalculationRow, PropertyUsage } from '../../types';

export const IMU_ENGINE_VERSION = '1.0.0';

/** Cadastral revaluation applied to rendita catastale (5%). */
export const REVALUATION = 1.05;

/**
 * Cadastral multipliers by category group (post rivalutazione).
 * Source: standard IMU coefficients.
 */
export const CATEGORY_COEFFICIENTS: Record<string, number> = {
  A: 160, // except A/10
  'A/10': 80,
  B: 140,
  'C/1': 55,
  'C/2': 160,
  'C/6': 160,
  'C/7': 160,
  'C/3': 140,
  'C/4': 140,
  'C/5': 140,
  D: 65, // except D/5
  'D/5': 80,
};

/** Resolve the coefficient for a cadastral category like "A/2", "C/2", "D/1". */
export function coefficientForCategory(category?: string): number {
  if (!category) return 160;
  const c = category.toUpperCase().trim();
  if (CATEGORY_COEFFICIENTS[c] != null) return CATEGORY_COEFFICIENTS[c];
  const group = c.split('/')[0];
  return CATEGORY_COEFFICIENTS[group] ?? 160;
}

/**
 * Luxury main-home categories (A/1 manors, A/8 villas, A/9 castles): these are the
 * ONLY abitazioni principali still subject to IMU. Every other main home is exempt.
 */
export const LUXURY_CATEGORIES = ['A/1', 'A/8', 'A/9'];

export function isLuxuryCategory(category?: string): boolean {
  if (!category) return false;
  return LUXURY_CATEGORIES.includes(category.toUpperCase().trim());
}

/**
 * In Italy the abitazione principale is exempt from IMU unless it falls in a luxury
 * category (A/1, A/8, A/9). The engine still computes the theoretical amount; this
 * flag tells the UI to present it as "esente prima casa".
 */
export function isMainHomeExempt(usage: PropertyUsage, category?: string): boolean {
  return usage === 'main_home' && !isLuxuryCategory(category);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** IMU F24 line amounts are rounded to the nearest euro. */
export function roundToEuro(n: number): number {
  return Math.round(n);
}

export interface ImuInput {
  cadastralIncome: number; // rendita catastale
  category?: string;
  aliquotaPerMille: number; // aliquota in ‰ (e.g. 10.6)
  ownershipShare: number; // % 0..100
  monthsOwned: number; // 0..12
  usage: PropertyUsage;
  deduction?: number; // detrazione (e.g. 200 for abitazione principale A/1,A/8,A/9)
}

export interface ImuResult {
  taxableBase: number; // base imponibile
  annualTax: number; // imposta annua (full year, full share)
  amountDue: number; // quota dovuta (after share, months, deduction)
  taxCode: string;
  warnings: string[];
}

/** Compute IMU for a single property. */
export function computeImu(input: ImuInput): ImuResult {
  const warnings: string[] = [];

  if (!input.cadastralIncome || input.cadastralIncome <= 0) {
    warnings.push('missingCadastralIncome');
  }
  if (input.aliquotaPerMille == null || input.aliquotaPerMille <= 0) {
    warnings.push('missingRate');
  }
  if (input.ownershipShare <= 0 || input.ownershipShare > 100) {
    warnings.push('invalidOwnershipShare');
  }
  if (input.monthsOwned < 0 || input.monthsOwned > 12) {
    warnings.push('invalidMonths');
  }

  const coeff = coefficientForCategory(input.category);
  const taxableBase = round2((input.cadastralIncome || 0) * REVALUATION * coeff);
  const annualTax = round2(taxableBase * (input.aliquotaPerMille / 1000));

  const sharePart = Math.max(0, Math.min(input.ownershipShare, 100)) / 100;
  const monthsPart = Math.max(0, Math.min(input.monthsOwned, 12)) / 12;
  const deduction = (input.deduction ?? 0) * monthsPart;

  const amountDue = Math.max(0, round2(annualTax * sharePart * monthsPart - deduction));

  return {
    taxableBase,
    annualTax,
    amountDue,
    taxCode: taxCodeForUsage(input.usage),
    warnings,
  };
}

export interface ImuInstallments {
  acconto: number;
  saldo: number;
  total: number;
}

/** Split the yearly amount into acconto (50%) and saldo, rounded to euro. */
export function splitInstallments(amountDue: number): ImuInstallments {
  const total = roundToEuro(amountDue);
  const acconto = roundToEuro(amountDue / 2);
  return { acconto, saldo: total - acconto, total };
}

/** Build F24 calculation rows from one or more computed properties. */
export function buildF24Rows(
  results: Array<{ taxCode: string; amountDue: number }>,
  installment: 'acconto' | 'saldo' | 'unico' = 'unico'
): CalculationRow[] {
  const byCode = new Map<string, number>();
  for (const r of results) {
    byCode.set(r.taxCode, (byCode.get(r.taxCode) ?? 0) + r.amountDue);
  }
  return Array.from(byCode.entries()).map(([taxCode, amount]) => ({
    taxCode,
    amount: roundToEuro(amount),
    installment,
  }));
}
