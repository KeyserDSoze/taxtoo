/**
 * Azure OpenAI service for Taxtoo:
 *  - interpretDocument: turn OCR text/tables into structured fiscal data + explanation
 *  - chatAssistant: copilot-like side chat about the user's IMU practice
 *  - generateSummary: human-readable IMU summary in the chosen language
 *
 * SECURITY: endpoint + key are entered by the user in Settings and stored in their
 * own Drive. dangerouslyAllowBrowser=true is acceptable for a single-user,
 * bring-your-own-key app. Do not use in a multi-tenant context.
 */

import { AzureOpenAI } from 'openai';
import type { AppSettings, ChatMessage, LocalTaxRow, TaxDocumentType } from '../types';

function getClient(settings: AppSettings): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: settings.azureOpenAIEndpoint,
    apiKey: settings.azureOpenAIKey,
    apiVersion: '2024-12-01-preview',
    dangerouslyAllowBrowser: true,
  });
}

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

// ---------- DOCUMENT INTERPRETATION ----------

export interface InterpretedDocument {
  documentType: TaxDocumentType;
  confidence: number;
  taxpayer?: {
    fiscalCode?: string;
    firstName?: string;
    lastName?: string;
  };
  localTaxRows?: LocalTaxRow[];
  total?: number;
  explanation: string;
}

/**
 * Interpret OCR output (text + tables) into structured fiscal data.
 * The explanation is written in `explanationLanguage`.
 * Tax codes, codice comune and codice fiscale are preserved verbatim.
 */
export async function interpretDocument(
  ocrText: string,
  tables: string[][][],
  settings: AppSettings
): Promise<InterpretedDocument> {
  const client = getClient(settings);
  const lang = languageName(settings.explanationLanguage ?? settings.language);

  const tablesText = tables
    .map((t, i) => `Table ${i + 1}:\n${t.map((row) => row.join(' | ')).join('\n')}`)
    .join('\n\n');

  const systemPrompt =
    'You are a fiscal data extraction assistant specialized in Italian tax documents ' +
    '(F24, visura catastale, deeds). Given OCR text and tables, extract structured data. ' +
    'NEVER translate or alter: codice fiscale, codice comune (e.g. L612), tax codes ' +
    '(codici tributo such as 3916, 3918), official tax names. ' +
    `Write the "explanation" field in ${lang}. ` +
    'Respond ONLY with a valid JSON object with this shape: ' +
    '{ "documentType": "f24"|"visura"|"deed"|"imu_declaration"|"receipt"|"rates_sheet"|"other", ' +
    '"confidence": number (0..1), ' +
    '"taxpayer": { "fiscalCode": string, "firstName": string, "lastName": string }, ' +
    '"localTaxRows": [ { "municipalityCode": string, "taxCode": string, "year": number, "amountDue": number } ], ' +
    '"total": number, ' +
    '"explanation": string }. ' +
    'Use null/empty for unknown fields. Amounts are numbers (use dot as decimal separator).';

  const userPrompt = `OCR text:\n${ocrText.slice(0, 12000)}\n\n${tablesText.slice(0, 6000)}`;

  const response = await client.chat.completions.create({
    model: settings.modelChat,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content) as InterpretedDocument;
    return {
      documentType: parsed.documentType ?? 'other',
      confidence: parsed.confidence ?? 0,
      taxpayer: parsed.taxpayer,
      localTaxRows: parsed.localTaxRows ?? [],
      total: parsed.total,
      explanation: parsed.explanation ?? '',
    };
  } catch {
    return { documentType: 'other', confidence: 0, explanation: content };
  }
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
  /** purchase = acquisto (diventa proprietario), sale = vendita (cede), other = informativo */
  deedKind: 'purchase' | 'sale' | 'other';
  /** Date the ownership starts (purchase) or ends (sale), ISO yyyy-mm-dd if found. */
  date?: string;
  ownerFiscalCode?: string;
  properties: ExtractedProperty[];
  confidence: number;
  explanation: string;
}

/**
 * Interpret a cadastral/deed document (visura catastale, atto notarile) and extract
 * the property/properties plus whether it is a purchase or a sale and the relevant date.
 */
export async function interpretPropertyDocument(
  ocrText: string,
  tables: string[][][],
  settings: AppSettings
): Promise<PropertyDocInterpretation> {
  const client = getClient(settings);
  const lang = languageName(settings.explanationLanguage ?? settings.language);

  const tablesText = tables
    .map((t, i) => `Table ${i + 1}:\n${t.map((row) => row.join(' | ')).join('\n')}`)
    .join('\n\n');

  const systemPrompt =
    'You are a real-estate data extraction assistant for Italian cadastral documents ' +
    '(visura catastale) and notarial deeds (atto di compravendita / vendita / acquisto). ' +
    'Extract the property or properties described. NEVER translate or alter codice comune ' +
    '(e.g. L612), codice fiscale, or cadastral categories (A/2, C/2, D/1...). ' +
    'Determine "deedKind": "purchase" if the document makes the taxpayer the new owner, ' +
    '"sale" if the taxpayer sells/transfers the property away, "other" for a plain visura. ' +
    'Extract "date" (the deed/effective date) as ISO yyyy-mm-dd when present. ' +
    `Write "explanation" in ${lang}. ` +
    'Respond ONLY with a valid JSON object: ' +
    '{ "documentType": "visura"|"deed"|"other", "deedKind": "purchase"|"sale"|"other", ' +
    '"date": string|null, "ownerFiscalCode": string|null, "confidence": number (0..1), ' +
    '"properties": [ { "label": string, "municipality": string, "municipalityCode": string, ' +
    '"category": string, "cadastralIncome": number, "ownershipShare": number, "address": string, ' +
    '"usageType": "main_home"|"other_building"|"land"|"buildable_area"|"appurtenance" } ], ' +
    '"explanation": string }. ' +
    'Use null/empty for unknown fields. cadastralIncome and ownershipShare are numbers (dot decimals).';

  const userPrompt = `OCR text:\n${ocrText.slice(0, 12000)}\n\n${tablesText.slice(0, 6000)}`;

  const response = await client.chat.completions.create({
    model: settings.modelChat,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content) as PropertyDocInterpretation;
    return {
      documentType: parsed.documentType ?? 'other',
      deedKind: parsed.deedKind ?? 'other',
      date: parsed.date ?? undefined,
      ownerFiscalCode: parsed.ownerFiscalCode ?? undefined,
      properties: parsed.properties ?? [],
      confidence: parsed.confidence ?? 0,
      explanation: parsed.explanation ?? '',
    };
  } catch {
    return { documentType: 'other', deedKind: 'other', properties: [], confidence: 0, explanation: content };
  }
}

// ---------- COPILOT-LIKE CHAT ----------
/**
 * Side assistant chat. `context` is an optional JSON-ish summary of the current
 * practice (taxpayer, property, calculation) the model can reason over.
 */
export async function chatAssistant(
  messages: ChatMessage[],
  context: string,
  settings: AppSettings
): Promise<string> {
  const client = getClient(settings);
  const lang = languageName(settings.explanationLanguage ?? settings.language);

  const systemPrompt =
    'You are Taxtoo, a helpful assistant for Italian local taxes (IMU). ' +
    'You explain calculations, tax codes (codici tributo), and what data is missing. ' +
    'You are NOT a substitute for a professional accountant and you say so when relevant. ' +
    'NEVER translate codice fiscale, codice comune, or tax codes. ' +
    `Reply in ${lang}, concise and clear, using markdown when helpful. ` +
    `Current practice context (JSON): ${context.slice(0, 4000)}`;

  const response = await client.chat.completions.create({
    model: settings.modelChat,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}

// ---------- IMU SUMMARY ----------

export async function generateSummary(
  calculationJson: string,
  settings: AppSettings,
  language?: string
): Promise<string> {
  const client = getClient(settings);
  const lang = languageName(language ?? settings.explanationLanguage ?? settings.language);

  const response = await client.chat.completions.create({
    model: settings.modelChat,
    messages: [
      {
        role: 'system',
        content:
          'You summarize an IMU calculation for the taxpayer. ' +
          `Write the summary in ${lang}. ` +
          'Keep tax codes, codice comune and amounts exact. ' +
          'Explain what was computed, the rows, and the total. ' +
          'Respond ONLY with the final markdown summary, no preface.',
      },
      { role: 'user', content: `Calculation (JSON):\n${calculationJson}` },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}
