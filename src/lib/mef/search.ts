/**
 * Web-search fallback for municipal IMU rates, used when the MEF dataset has no
 * resolution for a comune/year. Calls the keyless DuckDuckGo Worker
 * (VITE_MEF_SEARCH_PROXY, see infra/mef-search-worker.js), then asks the selected
 * AI provider to extract the aliquota (‰) for the property's usage + a source link.
 */

import { aiComplete } from '../../services/aiClient';
import type { AppSettings, PropertyUsage } from '../../types';

const SEARCH_BASE = (import.meta.env.VITE_MEF_SEARCH_PROXY as string | undefined)?.replace(/\/+$/, '');

export function isMefSearchConfigured(): boolean {
  return !!SEARCH_BASE;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  text: string;
}

export interface WebRateResult {
  perMille?: number;
  deduction?: number;
  sourceUrl?: string;
  explanation: string;
  notFound: boolean;
}

const USAGE_IT: Record<PropertyUsage, string> = {
  main_home: 'abitazione principale (categorie A/1, A/8, A/9)',
  other_building: 'altri fabbricati / fabbricati diversi dall’abitazione principale',
  land: 'terreni agricoli',
  buildable_area: 'aree fabbricabili / edificabili',
  appurtenance: 'pertinenze dell’abitazione principale',
};

async function webSearch(query: string, n = 3): Promise<SearchResult[]> {
  if (!SEARCH_BASE) throw new Error('VITE_MEF_SEARCH_PROXY non configurato');
  const url = `${SEARCH_BASE}/?q=${encodeURIComponent(query)}&n=${n}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Ricerca web: HTTP ${resp.status}`);
  const data = (await resp.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}

/**
 * Search the web for a comune's IMU rate for a given year and usage, then have the
 * AI extract a numeric per-mille rate (and the source URL) from the page texts.
 */
export async function searchAliquotaOnline(
  settings: AppSettings,
  comuneName: string,
  provincia: string,
  year: number,
  usage: PropertyUsage,
): Promise<WebRateResult> {
  const usageLabel = USAGE_IT[usage];
  const query = `aliquota IMU ${year} comune di ${comuneName}${provincia ? ` (${provincia})` : ''} ${usageLabel} delibera`;
  const results = await webSearch(query, 3);

  if (!results.length) {
    return { explanation: 'Nessun risultato di ricerca.', notFound: true };
  }

  const corpus = results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n${r.text}`.slice(0, 7000)
    )
    .join('\n\n---\n\n');

  const system =
    'Sei un assistente fiscale. Dai testi di pagine web cercate online, estrai l’aliquota IMU ' +
    `in per mille (‰) in vigore nel comune di ${comuneName} per l’anno ${year}, per la fattispecie: ${usageLabel}. ` +
    'Considera solo dati attendibili e riferiti esattamente a quel comune e a quell’anno. ' +
    'Se trovi anche la detrazione abitazione principale in euro, riportala. ' +
    'Indica come "sourceUrl" l’URL della pagina da cui hai preso il valore. ' +
    'Se non trovi un valore affidabile per quel comune/anno, imposta notFound=true. ' +
    'Rispondi SOLO con JSON valido: ' +
    '{ "perMille": number|null, "deduction": number|null, "sourceUrl": string|null, ' +
    '"explanation": string, "notFound": boolean }. ' +
    'perMille è un numero in per mille (es. 10.6).';

  const content = await aiComplete(
    settings,
    system,
    `Risultati di ricerca per "${query}":\n\n${corpus}`,
    [],
    true,
  );

  let parsed: Partial<WebRateResult> = {};
  try {
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { explanation: content, notFound: true };
  }

  const perMille = typeof parsed.perMille === 'number' ? parsed.perMille : undefined;
  return {
    perMille,
    deduction: typeof parsed.deduction === 'number' ? parsed.deduction : undefined,
    sourceUrl: parsed.sourceUrl ?? results[0]?.url,
    explanation: parsed.explanation ?? '',
    notFound: parsed.notFound === true || perMille == null,
  };
}
