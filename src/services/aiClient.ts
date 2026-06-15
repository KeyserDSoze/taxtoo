/**
 * Unified AI client for Taxtoo. The user picks one provider in Settings; all
 * extraction/chat goes through here. Supports multimodal input (text + files
 * such as images and PDFs) so we can read documents directly — no separate OCR.
 *
 * Providers:
 *  - azure_openai : Azure OpenAI (user endpoint + key + deployment), via `openai` SDK
 *  - openai       : OpenAI (user key + model), via `openai` SDK
 *  - gemini       : Google Gemini (user key + model), via REST generateContent
 *  - copilot_m365 : Microsoft 365 Copilot — requires a Copilot licence; not wired
 *                   for direct API calls yet (guarded with a clear message).
 *
 * SECURITY: keys are entered by the user in Settings and stored in their own Drive.
 * dangerouslyAllowBrowser is acceptable for this single-user, bring-your-own-key app.
 */

import { AzureOpenAI, OpenAI } from 'openai';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import type { AppSettings, AiProvider } from '../types';
import { pdfToImages } from './pdfRender';
import {
  copilotMsalInstance,
  COPILOT_SCOPES,
  COPILOT_ENABLED,
} from '../config/msal';

export interface AiFile {
  mimeType: string;
  base64: string;
}

export async function fileToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── Document preparation ──────────────────────────────────────────────────────
// Different file types are handled differently:
//  - images    → sent natively (image_url / inlineData)
//  - PDF        → sent natively (OpenAI "file" part / Gemini inlineData)
//  - csv/txt    → read as text
//  - xlsx/xls   → parsed to CSV text (SheetJS)
//  - docx/odt   → unzipped, text extracted from the XML body
// so the model always receives something it can read.

export type PreparedDoc =
  | { kind: 'image'; mimeType: string; base64: string; filename: string }
  | { kind: 'images'; images: { mimeType: string; base64: string }[]; filename: string }
  | { kind: 'pdf'; mimeType: string; base64: string; filename: string }
  | { kind: 'text'; text: string; filename: string };

/** Accept attribute for file inputs across the app. */
export const SUPPORTED_DOC_ACCEPT =
  'image/*,application/pdf,.pdf,.csv,text/csv,.txt,.xlsx,.xls,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,' +
  '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  '.odt,application/vnd.oasis.opendocument.text';

function stripXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unzipEntry(buf: Uint8Array, entry: string): string | null {
  try {
    const files = unzipSync(buf);
    const data = files[entry];
    return data ? strFromU8(data) : null;
  } catch {
    return null;
  }
}

export async function prepareDocument(file: File): Promise<PreparedDoc> {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  const ext = name.split('.').pop() ?? '';

  // Images
  if (type.startsWith('image/')) {
    return { kind: 'image', mimeType: type, base64: await fileToBase64(file), filename: file.name };
  }

  // PDF — rasterize to page images so vision models reliably OCR scanned/image-only
  // PDFs (native PDF parsing is inconsistent across providers). Fallback to native.
  if (type === 'application/pdf' || ext === 'pdf') {
    try {
      const pages = await pdfToImages(file);
      if (pages.length) {
        return { kind: 'images', images: pages, filename: file.name };
      }
    } catch {
      /* fall back to native PDF */
    }
    return { kind: 'pdf', mimeType: 'application/pdf', base64: await fileToBase64(file), filename: file.name };
  }

  // Spreadsheets → CSV text per sheet
  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    type.includes('spreadsheet') ||
    type.includes('excel')
  ) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const text = wb.SheetNames.map(
      (n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`
    ).join('\n\n');
    return { kind: 'text', text, filename: file.name };
  }

  // Word .docx → text from word/document.xml
  if (ext === 'docx' || type.includes('wordprocessingml')) {
    const xml = unzipEntry(new Uint8Array(await file.arrayBuffer()), 'word/document.xml');
    return { kind: 'text', text: xml ? stripXml(xml) : '', filename: file.name };
  }

  // OpenDocument .odt → text from content.xml
  if (ext === 'odt' || type.includes('opendocument.text')) {
    const xml = unzipEntry(new Uint8Array(await file.arrayBuffer()), 'content.xml');
    return { kind: 'text', text: xml ? stripXml(xml) : '', filename: file.name };
  }

  // CSV / plain text / anything else readable as text
  const text = await file.text().catch(() => '');
  return { kind: 'text', text, filename: file.name };
}

/** Human label for a provider (for UI). */
export const AI_PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'copilot_m365', label: 'Microsoft 365 Copilot' },
];

/** Is the selected provider configured well enough to call? */
export function isAiConfigured(s?: AppSettings | null): boolean {
  if (!s) return false;
  switch (s.aiProvider) {
    case 'azure_openai':
      return !!s.azureOpenAIEndpoint && !!s.azureOpenAIKey && !!s.azureOpenAIModel;
    case 'openai':
      return !!s.openAIKey && !!s.openAIModel;
    case 'gemini':
      return !!s.geminiKey && !!s.geminiModel;
    case 'copilot_m365':
      return COPILOT_ENABLED;
    default:
      return false;
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ── OpenAI / Azure OpenAI (SDK) ───────────────────────────────────────────────
function openAiClient(s: AppSettings): OpenAI | AzureOpenAI {
  if (s.aiProvider === 'azure_openai') {
    return new AzureOpenAI({
      endpoint: s.azureOpenAIEndpoint,
      apiKey: s.azureOpenAIKey,
      apiVersion: '2024-12-01-preview',
      dangerouslyAllowBrowser: true,
    });
  }
  return new OpenAI({ apiKey: s.openAIKey, dangerouslyAllowBrowser: true });
}

function openAiModel(s: AppSettings): string {
  return s.aiProvider === 'azure_openai' ? s.azureOpenAIModel : s.openAIModel;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function openAiUserContent(text: string, docs: PreparedDoc[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  let prompt = text;
  for (const d of docs) {
    if (d.kind === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${d.mimeType};base64,${d.base64}`, detail: 'auto' },
      });
    } else if (d.kind === 'images') {
      for (const img of d.images) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' },
        });
      }
    } else if (d.kind === 'pdf') {
      // OpenAI / Azure chat completions accept PDFs as a "file" content part.
      parts.push({
        type: 'file',
        file: { filename: d.filename, file_data: `data:application/pdf;base64,${d.base64}` },
      });
    } else {
      // Extracted text (csv/xlsx/docx/odt) folded into the prompt.
      prompt += `\n\n--- ${d.filename} ---\n${d.text.slice(0, 20000)}`;
    }
  }
  parts.unshift({ type: 'text', text: prompt });
  return parts;
}

// ── Gemini (REST) ─────────────────────────────────────────────────────────────
async function geminiGenerate(
  s: AppSettings,
  system: string,
  text: string,
  docs: PreparedDoc[],
  json: boolean,
  history: ChatTurn[] = []
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiKey}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = history.map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
  let prompt = text;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  for (const d of docs) {
    if (d.kind === 'image' || d.kind === 'pdf') {
      parts.push({ inlineData: { mimeType: d.mimeType, data: d.base64 } });
    } else if (d.kind === 'images') {
      for (const img of d.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    } else {
      prompt += `\n\n--- ${d.filename} ---\n${d.text.slice(0, 20000)}`;
    }
  }
  parts.unshift({ text: prompt });
  contents.push({ role: 'user', parts });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: json ? { responseMimeType: 'application/json' } : {},
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Gemini error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cand = data.candidates?.[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('') ?? '';
}

// ── Microsoft 365 Copilot (Graph Retrieval API, behind flag) ──────────────────
// EXPERIMENTAL. Requires the user to hold an M365 Copilot licence and the 2nd app
// registration consented. The Retrieval API returns grounding extracts from the
// user's M365 content; we return them as context text. Endpoint/scope may need
// adjustment when tested with a real licence — kept isolated and flag-gated.
const COPILOT_RETRIEVAL_URL = 'https://graph.microsoft.com/beta/copilot/retrieval';

async function copilotToken(): Promise<string> {
  if (!copilotMsalInstance) throw new Error('Copilot non configurato (manca la 2ª app registration).');
  await copilotMsalInstance.initialize();
  const accounts = copilotMsalInstance.getAllAccounts();
  const account = accounts[0];
  try {
    const res = account
      ? await copilotMsalInstance.acquireTokenSilent({ scopes: COPILOT_SCOPES, account })
      : await copilotMsalInstance.loginPopup({ scopes: COPILOT_SCOPES });
    return res.accessToken;
  } catch {
    const res = await copilotMsalInstance.loginPopup({ scopes: COPILOT_SCOPES });
    return res.accessToken;
  }
}

async function copilotRetrieve(query: string): Promise<string> {
  const token = await copilotToken();
  const resp = await fetch(COPILOT_RETRIEVAL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ queryString: query, dataSource: 'sharePoint', maximumNumberOfResults: 10 }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Copilot Retrieval error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits = (data.retrievalHits ?? data.value ?? []) as any[];
  return hits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((h: any) => (h.extracts ?? [{ text: h.text }]).map((e: any) => e.text).join('\n'))
    .join('\n\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Single-shot completion with optional documents. Returns the model's text. */
export async function aiComplete(
  settings: AppSettings,
  system: string,
  text: string,
  docs: PreparedDoc[] = [],
  json = false
): Promise<string> {
  if (settings.aiProvider === 'copilot_m365') {
    if (!COPILOT_ENABLED) {
      throw new Error(
        'Microsoft 365 Copilot è dietro flag (VITE_ENABLE_COPILOT) e in fase di test. Usa Azure OpenAI, OpenAI o Gemini.'
      );
    }
    const grounding = await copilotRetrieve(text);
    return grounding
      ? `Contenuti rilevanti dai tuoi documenti Microsoft 365 (Copilot Retrieval):\n\n${grounding}`
      : 'Nessun contenuto rilevante trovato tramite Microsoft 365 Copilot.';
  }
  if (settings.aiProvider === 'gemini') {
    return geminiGenerate(settings, system, text, docs, json);
  }
  const client = openAiClient(settings);
  const response = await client.chat.completions.create({
    model: openAiModel(settings),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: openAiUserContent(text, docs) },
    ],
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
  });
  return response.choices[0]?.message?.content ?? '';
}

/** Multi-turn chat. */
export async function aiChat(
  settings: AppSettings,
  system: string,
  messages: ChatTurn[]
): Promise<string> {
  if (settings.aiProvider === 'copilot_m365') {
    if (!COPILOT_ENABLED) {
      throw new Error(
        'Microsoft 365 Copilot è dietro flag (VITE_ENABLE_COPILOT) e in fase di test. Usa Azure OpenAI, OpenAI o Gemini.'
      );
    }
    const last = messages[messages.length - 1];
    const grounding = await copilotRetrieve(last?.content ?? '');
    return grounding
      ? `Contenuti rilevanti dai tuoi documenti Microsoft 365 (Copilot Retrieval):\n\n${grounding}`
      : 'Nessun contenuto rilevante trovato tramite Microsoft 365 Copilot.';
  }
  if (settings.aiProvider === 'gemini') {
    const last = messages[messages.length - 1];
    return geminiGenerate(settings, system, last?.content ?? '', [], false, messages.slice(0, -1));
  }
  const client = openAiClient(settings);
  const response = await client.chat.completions.create({
    model: openAiModel(settings),
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ],
  });
  return response.choices[0]?.message?.content ?? '';
}
