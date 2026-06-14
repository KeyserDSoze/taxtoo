/**
 * Taxtoo AI service — provider-agnostic (Azure OpenAI / OpenAI / Gemini) via aiClient.
 *  - interpretDocument: read an F24/visura/deed file directly and return structured data
 *  - interpretPropertyDocument: extract property/properties + purchase/sale + date
 *  - chatAssistant: copilot-like side chat about the user's IMU practice
 *  - generateSummary: human-readable IMU summary in the chosen language
 *
 * Documents are read directly by the multimodal model — no separate OCR step.
 */

import { aiComplete, aiChat, prepareDocument } from './aiClient';
import type { AppSettings, ChatMessage, LocalTaxRow, TaxDocumentType, PropertyUsage } from '../types';

const LANG_NAMES: Record<string, string> = {
  it: 'Italian',
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
};

function languageName(code?: string): string {
  return LANG_NAMES[code ?? 'it'] ?? 'Italian';
}

function parseJson<T>(content: string, fallback: T): T {
  try {
    // Strip code fences if the model wrapped the JSON.
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ---------- DOCUMENT INTERPRETATION (F24 etc.) ----------

export interface InterpretedDocument {
  documentType: TaxDocumentType;
  confidence: number;
  taxpayer?: { fiscalCode?: string; firstName?: string; lastName?: string };
  localTaxRows?: LocalTaxRow[];
  total?: number;
  explanation: string;
}

export async function interpretDocument(
  file: File,
  settings: AppSettings
): Promise<InterpretedDocument> {
  const lang = languageName(settings.explanationLanguage ?? settings.language);
  const system =
    'You are a fiscal data extraction assistant specialized in Italian tax documents ' +
    '(F24, visura catastale, deeds). Read the attached document and extract structured data. ' +
    'NEVER translate or alter: codice fiscale, codice comune (e.g. L612), tax codes ' +
    '(codici tributo such as 3916, 3918), official tax names. ' +
    `Write the "explanation" field in ${lang}. ` +
    'Respond ONLY with a valid JSON object with this shape: ' +
    '{ "documentType": "f24"|"visura"|"deed"|"imu_declaration"|"receipt"|"rates_sheet"|"other", ' +
    '"confidence": number (0..1), ' +
    '"taxpayer": { "fiscalCode": string, "firstName": string, "lastName": string }, ' +
    '"localTaxRows": [ { "municipalityCode": string, "taxCode": string, "year": number, "amountDue": number } ], ' +
    '"total": number, "explanation": string }. ' +
    'Use null/empty for unknown fields. Amounts are numbers (use dot as decimal separator).';

  const content = await aiComplete(
    settings,
    system,
    'Analizza il documento allegato ed estrai i dati fiscali richiesti.',
    [await prepareDocument(file)],
    true
  );
  const parsed = parseJson<InterpretedDocument>(content, {
    documentType: 'other',
    confidence: 0,
    explanation: content,
  });
  return {
    documentType: parsed.documentType ?? 'other',
    confidence: parsed.confidence ?? 0,
    taxpayer: parsed.taxpayer,
    localTaxRows: parsed.localTaxRows ?? [],
    total: parsed.total,
    explanation: parsed.explanation ?? '',
  };
}

// ---------- PROPERTY DOCUMENT INTERPRETATION (visura / deed) ----------

export interface ExtractedProperty {
  label?: string;
  municipality?: string;
  municipalityCode?: string;
  category?: string;
  cadastralIncome?: number;
  ownershipShare?: number;
  address?: string;
  usageType?: 'main_home' | 'other_building' | 'land' | 'buildable_area' | 'appurtenance';
}

export interface PropertyDocInterpretation {
  documentType: TaxDocumentType;
  /** purchase = acquisto, sale = vendita, other = informativo (visura) */
  deedKind: 'purchase' | 'sale' | 'other';
  date?: string;
  ownerFiscalCode?: string;
  properties: ExtractedProperty[];
  confidence: number;
  explanation: string;
}

export async function interpretPropertyDocument(
  file: File,
  settings: AppSettings
): Promise<PropertyDocInterpretation> {
  const lang = languageName(settings.explanationLanguage ?? settings.language);
  const system =
    'You are a real-estate data extraction assistant for Italian cadastral documents ' +
    '(visura catastale) and notarial deeds (atto di compravendita / vendita / acquisto). ' +
    'Read the attached document and extract the property or properties described. ' +
    'NEVER translate or alter codice comune (e.g. L612), codice fiscale, or cadastral ' +
    'categories (A/2, C/2, D/1...). Determine "deedKind": "purchase" if the document makes ' +
    'the taxpayer the new owner, "sale" if the taxpayer sells/transfers the property away, ' +
    '"other" for a plain visura. Extract "date" (deed/effective date) as ISO yyyy-mm-dd when present. ' +
    `Write "explanation" in ${lang}. ` +
    'Respond ONLY with a valid JSON object: ' +
    '{ "documentType": "visura"|"deed"|"other", "deedKind": "purchase"|"sale"|"other", ' +
    '"date": string|null, "ownerFiscalCode": string|null, "confidence": number (0..1), ' +
    '"properties": [ { "label": string, "municipality": string, "municipalityCode": string, ' +
    '"category": string, "cadastralIncome": number, "ownershipShare": number, "address": string, ' +
    '"usageType": "main_home"|"other_building"|"land"|"buildable_area"|"appurtenance" } ], ' +
    '"explanation": string }. ' +
    'Use null/empty for unknown fields. cadastralIncome and ownershipShare are numbers (dot decimals).';

  const content = await aiComplete(
    settings,
    system,
    'Analizza il documento immobiliare allegato ed estrai gli immobili.',
    [await prepareDocument(file)],
    true
  );
  const parsed = parseJson<PropertyDocInterpretation>(content, {
    documentType: 'other',
    deedKind: 'other',
    properties: [],
    confidence: 0,
    explanation: content,
  });
  return {
    documentType: parsed.documentType ?? 'other',
    deedKind: parsed.deedKind ?? 'other',
    date: parsed.date ?? undefined,
    ownerFiscalCode: parsed.ownerFiscalCode ?? undefined,
    properties: parsed.properties ?? [],
    confidence: parsed.confidence ?? 0,
    explanation: parsed.explanation ?? '',
  };
}

// ---------- MUNICIPAL IMU RATES (delibera comunale) ----------

export interface AliquoteInterpretation {
  perMilleByUsage: Partial<Record<PropertyUsage, number>>;
  deduction?: number; // detrazione abitazione principale (€)
  explanation: string;
}

/**
 * Read a municipal IMU resolution (delibera DIMUNIC) PDF for a given year and
 * extract the aliquote (in ‰) by property usage, plus the abitazione principale
 * deduction if present.
 */
export async function interpretAliquote(
  file: File,
  year: number,
  settings: AppSettings
): Promise<AliquoteInterpretation> {
  const lang = languageName(settings.explanationLanguage ?? settings.language);
  const system =
    'You read an Italian municipal IMU resolution ("delibera/prospetto aliquote IMU"). ' +
    `Extract the IMU rates (aliquote) in per mille (\u2030) for year ${year}, mapped to usage types. ` +
    'Map to these usage keys: main_home (abitazione principale e pertinenze, categorie A/1 A/8 A/9), ' +
    'other_building (altri fabbricati / fabbricati diversi), land (terreni agricoli), ' +
    'buildable_area (aree fabbricabili / edificabili), appurtenance (pertinenze). ' +
    'Also extract the abitazione principale deduction (detrazione) in euro if present. ' +
    `Write "explanation" in ${lang}. ` +
    'Respond ONLY with valid JSON: ' +
    '{ "perMilleByUsage": { "main_home": number, "other_building": number, "land": number, ' +
    '"buildable_area": number, "appurtenance": number }, "deduction": number, "explanation": string }. ' +
    'Use null for usages not present. Rates are numbers in per mille (e.g. 10.6).';

  const content = await aiComplete(
    settings,
    system,
    `Estrai le aliquote IMU per l'anno ${year} dal documento allegato.`,
    [await prepareDocument(file)],
    true
  );
  const parsed = parseJson<AliquoteInterpretation>(content, { perMilleByUsage: {}, explanation: content });
  return {
    perMilleByUsage: parsed.perMilleByUsage ?? {},
    deduction: parsed.deduction,
    explanation: parsed.explanation ?? '',
  };
}

// ---------- COPILOT-LIKE CHAT ----------
export async function chatAssistant(
  messages: ChatMessage[],
  context: string,
  settings: AppSettings
): Promise<string> {
  const lang = languageName(settings.explanationLanguage ?? settings.language);
  const system =
    'You are Taxtoo, a helpful assistant for Italian local taxes (IMU). ' +
    'You explain calculations, tax codes (codici tributo), and what data is missing. ' +
    'You are NOT a substitute for a professional accountant and you say so when relevant. ' +
    'NEVER translate codice fiscale, codice comune, or tax codes. ' +
    `Reply in ${lang}, concise and clear, using markdown when helpful. ` +
    `Current practice context (JSON): ${context.slice(0, 4000)}`;

  return aiChat(
    settings,
    system,
    messages.map((m) => ({ role: m.role, content: m.content }))
  );
}

// ---------- IMU SUMMARY ----------

export async function generateSummary(
  calculationJson: string,
  settings: AppSettings,
  language?: string
): Promise<string> {
  const lang = languageName(language ?? settings.explanationLanguage ?? settings.language);
  const system =
    'You summarize an IMU calculation for the taxpayer. ' +
    `Write the summary in ${lang}. ` +
    'Keep tax codes, codice comune and amounts exact. ' +
    'Explain what was computed, the rows, and the total. ' +
    'Respond ONLY with the final markdown summary, no preface.';

  return aiComplete(settings, system, `Calculation (JSON):\n${calculationJson}`);
}
