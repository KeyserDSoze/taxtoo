/**
 * Italian comuni dataset — loaded once into memory (and localStorage) so every
 * municipality lookup maps the comune name to its codice catastale (e.g. L612),
 * codice ISTAT and province with zero typos.
 *
 * Sources (opendatasicilia/comuni-italiani):
 *  - comuni.csv:                comune, pro_com_t (ISTAT), den_prov, sigla, den_reg, cod_reg
 *  - comuni_codici-catastali.csv: pro_com_t, codice_catastale, comune
 * Merged on pro_com_t.
 */

export interface Comune {
  name: string;
  istat: string; // pro_com_t
  catastale: string; // codice catastale (F24 codice ente/comune)
  provincia: string;
  sigla: string; // province abbreviation, e.g. VT
  regione: string;
}

const COMUNI_URL =
  'https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/comuni.csv';
const CATASTALI_URL =
  'https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/comuni_codici-catastali.csv';

const CACHE_KEY = 'taxtoo-comuni-v1';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

let memoryCache: Comune[] | null = null;
let inFlight: Promise<Comune[]> | null = null;

/** Minimal CSV line splitter (these datasets have no quoted/commas-in-fields). */
function splitCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAndMerge(): Promise<Comune[]> {
  const [comuniRes, catRes] = await Promise.all([fetch(COMUNI_URL), fetch(CATASTALI_URL)]);
  if (!comuniRes.ok || !catRes.ok) throw new Error('Comuni dataset fetch failed');
  const comuniRows = splitCsv(await comuniRes.text());
  const catRows = splitCsv(await catRes.text());

  // catastali: pro_com_t -> codice_catastale (skip header)
  const catByIstat = new Map<string, string>();
  for (let i = 1; i < catRows.length; i++) {
    const [istat, catastale] = catRows[i];
    if (istat) catByIstat.set(istat, catastale);
  }

  // comuni: comune, pro_com_t, den_prov, sigla, den_reg, cod_reg (skip header)
  const out: Comune[] = [];
  for (let i = 1; i < comuniRows.length; i++) {
    const [name, istat, provincia, sigla, regione] = comuniRows[i];
    if (!name || !istat) continue;
    out.push({
      name,
      istat,
      catastale: catByIstat.get(istat) ?? '',
      provincia: provincia ?? '',
      sigla: sigla ?? '',
      regione: regione ?? '',
    });
  }
  return out;
}

/** Load the comuni list (memory → localStorage → network). Coalesces concurrent calls. */
export function loadComuni(): Promise<Comune[]> {
  if (memoryCache) return Promise.resolve(memoryCache);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // localStorage cache
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { at: number; data: Comune[] };
        if (Date.now() - cached.at < CACHE_TTL_MS && Array.isArray(cached.data) && cached.data.length) {
          memoryCache = cached.data;
          return memoryCache;
        }
      }
    } catch {
      /* ignore corrupt cache */
    }

    const data = await fetchAndMerge();
    memoryCache = data;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* quota — keep memory cache only */
    }
    return data;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Fire-and-forget preload (call on app start). */
export function preloadComuni(): void {
  loadComuni().catch(() => {});
}

/** Search comuni by name (prefix-first, then contains). */
export function searchComuni(list: Comune[], query: string, limit = 8): Comune[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: Comune[] = [];
  const contains: Comune[] = [];
  for (const c of list) {
    const n = normalize(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (n.includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Look up a comune by its codice catastale (e.g. L612). */
export function findByCatastale(list: Comune[], catastale: string): Comune | undefined {
  const c = catastale.toUpperCase().trim();
  return list.find((x) => x.catastale.toUpperCase() === c);
}

/** Look up a comune by its (normalized) name — exact match first, then the best search hit. */
export function findByName(list: Comune[], name: string): Comune | undefined {
  const q = normalize(name);
  if (!q) return undefined;
  const exact = list.find((x) => normalize(x.name) === q);
  if (exact) return exact;
  return searchComuni(list, name, 1)[0];
}
