/**
 * MEF municipal IMU resolutions (datizip) — client pipeline.
 *
 * The MEF publishes, per year and per region, a ZIP of municipal IMU resolution
 * PDFs (DIMUNIC = Delibera IMU Comunale). Filenames look like:
 *   16395_DIMUNIC-01aq26i558d.pdf
 *                  └┬┘└┬┘└┬┘└─┬┘
 *      region idx ──┘  │  │   └ codice catastale (1 letter + 3 digits, lowercase)
 *      province sigla ─┘  └ year (2 digits)
 * The leading number and "DIMUNIC" are ignored. We match the codice catastale
 * (e.g. L612) and the year.
 *
 * Because the MEF endpoint has no CORS, ZIPs are fetched through a thin proxy
 * (VITE_MEF_PROXY, a Cloudflare Worker — see infra/mef-proxy-worker.js).
 */

import { unzipSync } from 'fflate';

const PROXY_BASE = (import.meta.env.VITE_MEF_PROXY as string | undefined)?.replace(/\/+$/, '');

/**
 * Map an ISTAT region name (den_reg, e.g. "Emilia-Romagna", "Valle d'Aosta/Vallée
 * d'Aoste") to the MEF zip slug. Trentino-Alto Adige and Friuli-Venezia Giulia are
 * intentionally absent: they apply their own local taxes (IMIS/GIS, ILIA), not IMU,
 * so the MEF IMU dataset has no zip for them.
 */
const REGION_SLUGS: Record<string, string> = {
  piemonte: 'piemonte',
  valledaosta: 'valledaosta',
  lombardia: 'lombardia',
  veneto: 'veneto',
  liguria: 'liguria',
  emiliaromagna: 'emilia-romagna',
  toscana: 'toscana',
  umbria: 'umbria',
  marche: 'marche',
  lazio: 'lazio',
  abruzzo: 'abruzzo',
  molise: 'molise',
  campania: 'campania',
  puglia: 'puglia',
  basilicata: 'basilicata',
  calabria: 'calabria',
  sicilia: 'sicilia',
  sardegna: 'sardegna',
};

function compactRegion(regione: string): string {
  return regione
    .split('/')[0] // "Valle d'Aosta/Vallée d'Aoste" → "Valle d'Aosta"
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

export function regionSlug(regione: string): string | null {
  return REGION_SLUGS[compactRegion(regione)] ?? null;
}

export function isMefConfigured(): boolean {
  return !!PROXY_BASE;
}

export interface MefDoc {
  year: number;
  filename: string;
  blob: Blob;
}

export interface MefYearResult {
  year: number;
  status: 'found' | 'not_found' | 'region_unavailable' | 'error';
  docs: MefDoc[];
  message?: string;
}

const FILE_RE = /dimunic-\d{2}[a-z]{2}(\d{2})([a-z]\d{3})d\.pdf$/i;

/** Fetch + unzip one region/year and return the PDFs matching a codice catastale. */
async function fetchYear(
  slug: string,
  year: number,
  catastale: string
): Promise<MefDoc[]> {
  const url = `${PROXY_BASE}/?path=${year}/${slug}.zip`;
  const resp = await fetch(url);
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`MEF ${slug} ${year}: HTTP ${resp.status}`);

  const buf = new Uint8Array(await resp.arrayBuffer());
  const files = unzipSync(buf);
  const want = catastale.toLowerCase();
  const docs: MefDoc[] = [];

  for (const [name, data] of Object.entries(files)) {
    const base = name.split('/').pop() ?? name;
    const m = base.toLowerCase().match(FILE_RE);
    if (!m) continue;
    const fileCatastale = m[2];
    if (fileCatastale !== want) continue;
    docs.push({
      year,
      filename: base,
      blob: new Blob([data as BlobPart], { type: 'application/pdf' }),
    });
  }
  return docs;
}

/**
 * For a comune (codice catastale + region), download the IMU resolution PDFs for
 * every year in [fromYear, toYear]. Missing years are reported, never thrown.
 * `onProgress` is called as each year completes.
 */
export async function fetchComuneResolutions(
  catastale: string,
  regione: string,
  fromYear: number,
  toYear: number,
  onProgress?: (r: MefYearResult) => void | Promise<void>
): Promise<MefYearResult[]> {
  const slug = regionSlug(regione);
  const results: MefYearResult[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    let r: MefYearResult;
    if (!slug) {
      r = {
        year,
        status: 'region_unavailable',
        docs: [],
        message: 'Regione non presente nel dataset IMU del MEF (tributo locale autonomo).',
      };
    } else if (!PROXY_BASE) {
      r = { year, status: 'error', docs: [], message: 'Proxy MEF non configurato (VITE_MEF_PROXY).' };
    } else {
      try {
        const docs = await fetchYear(slug, year, catastale);
        r = docs.length
          ? { year, status: 'found', docs }
          : { year, status: 'not_found', docs: [], message: 'Nessuna delibera trovata per questo comune/anno.' };
      } catch (e) {
        r = { year, status: 'error', docs: [], message: e instanceof Error ? e.message : 'Errore' };
      }
    }
    results.push(r);
    await onProgress?.(r);
  }
  return results;
}

/** Fetch the MEF resolution for a single comune/year (used by the per-year refresh). */
export async function fetchComuneYear(
  catastale: string,
  regione: string,
  year: number
): Promise<MefYearResult> {
  const slug = regionSlug(regione);
  if (!slug) {
    return {
      year,
      status: 'region_unavailable',
      docs: [],
      message: 'Regione non presente nel dataset IMU del MEF (tributo locale autonomo).',
    };
  }
  if (!PROXY_BASE) {
    return { year, status: 'error', docs: [], message: 'Proxy MEF non configurato (VITE_MEF_PROXY).' };
  }
  try {
    const docs = await fetchYear(slug, year, catastale);
    return docs.length
      ? { year, status: 'found', docs }
      : { year, status: 'not_found', docs: [], message: 'Nessuna delibera trovata per questo comune/anno.' };
  } catch (e) {
    return { year, status: 'error', docs: [], message: e instanceof Error ? e.message : 'Errore' };
  }
}
