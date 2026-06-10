/**
 * IMU tax-code dictionary (codici tributo).
 * The CODE itself is never translated. `labelKey` points to an i18n key for display.
 */

import type { PropertyUsage } from '../../types';

export interface TaxCodeInfo {
  code: string;
  /** i18n key under `taxCodes.<key>` for the human label */
  labelKey: string;
  usage: PropertyUsage[];
}

export const IMU_TAX_CODES: Record<string, TaxCodeInfo> = {
  '3912': { code: '3912', labelKey: 'mainHome', usage: ['main_home', 'appurtenance'] },
  '3914': { code: '3914', labelKey: 'land', usage: ['land'] },
  '3916': { code: '3916', labelKey: 'buildableArea', usage: ['buildable_area'] },
  '3918': { code: '3918', labelKey: 'otherBuildings', usage: ['other_building'] },
  '3925': { code: '3925', labelKey: 'groupDState', usage: [] },
  '3930': { code: '3930', labelKey: 'groupDMunicipality', usage: [] },
};

/** Pick the default IMU tax code for a property usage. */
export function taxCodeForUsage(usage: PropertyUsage): string {
  switch (usage) {
    case 'main_home':
    case 'appurtenance':
      return '3912';
    case 'land':
      return '3914';
    case 'buildable_area':
      return '3916';
    case 'other_building':
    default:
      return '3918';
  }
}

export function taxCodeInfo(code: string): TaxCodeInfo | undefined {
  return IMU_TAX_CODES[code];
}
