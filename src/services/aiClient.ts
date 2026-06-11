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
import type { AppSettings, AiProvider } from '../types';

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
      return false; // direct API calls not available yet
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
function openAiUserContent(text: string, files: AiFile[]): any[] {
  const parts: unknown[] = [{ type: 'text', text }];
  for (const f of files) {
    // gpt-4o accepts images as image_url data URLs. PDFs work best with Gemini.
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${f.mimeType};base64,${f.base64}`, detail: 'auto' },
    });
  }
  return parts;
}

// ── Gemini (REST) ─────────────────────────────────────────────────────────────
async function geminiGenerate(
  s: AppSettings,
  system: string,
  text: string,
  files: AiFile[],
  json: boolean,
  history: ChatTurn[] = []
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiKey}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = history.map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text }];
  for (const f of files) parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
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

// ── Public API ────────────────────────────────────────────────────────────────

/** Single-shot completion with optional files. Returns the model's text. */
export async function aiComplete(
  settings: AppSettings,
  system: string,
  text: string,
  files: AiFile[] = [],
  json = false
): Promise<string> {
  if (settings.aiProvider === 'copilot_m365') {
    throw new Error(
      'Microsoft 365 Copilot non è ancora disponibile per le chiamate dirette. Seleziona Azure OpenAI, OpenAI o Gemini.'
    );
  }
  if (settings.aiProvider === 'gemini') {
    return geminiGenerate(settings, system, text, files, json);
  }
  const client = openAiClient(settings);
  const response = await client.chat.completions.create({
    model: openAiModel(settings),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: openAiUserContent(text, files) },
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
    throw new Error(
      'Microsoft 365 Copilot non è ancora disponibile per le chiamate dirette. Seleziona Azure OpenAI, OpenAI o Gemini.'
    );
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
