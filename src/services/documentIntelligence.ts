/**
 * Azure Document Intelligence (formerly Form Recognizer) — client-side OCR.
 *
 * Reads scanned/native PDFs and images (F24, visure, deeds) and returns the raw
 * text + tables. The structured fiscal interpretation is done separately by
 * azureOpenAI.ts (interpretDocument), keeping OCR and reasoning decoupled.
 *
 * SECURITY: endpoint + key are entered by the user in Settings and stored in their
 * own Drive. Calls go directly from the browser. Acceptable for a single-user,
 * bring-your-own-key app. Do not use in a multi-tenant context.
 */

import type { AppSettings } from '../types';

const API_VERSION = '2024-11-30';

export interface DocIntelResult {
  content: string;
  tables: string[][][]; // tables[t][row][col]
  pageCount: number;
}

function trimEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

/**
 * Analyze a document with the prebuilt-layout model (text + tables).
 * Polls the async operation until it completes.
 */
export async function analyzeDocument(
  file: Blob,
  settings: AppSettings,
  model: 'prebuilt-read' | 'prebuilt-layout' = 'prebuilt-layout'
): Promise<DocIntelResult> {
  if (!settings.docIntelEndpoint || !settings.docIntelKey) {
    throw new Error('Document Intelligence endpoint/key not configured');
  }
  const base = trimEndpoint(settings.docIntelEndpoint);
  const analyzeUrl =
    `${base}/documentintelligence/documentModels/${model}:analyze?api-version=${API_VERSION}`;

  const submit = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': settings.docIntelKey,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!submit.ok) {
    const text = await submit.text().catch(() => '');
    throw new Error(`Document Intelligence submit failed (${submit.status}): ${text}`);
  }

  const operationLocation = submit.headers.get('operation-location');
  if (!operationLocation) throw new Error('Missing operation-location header');

  // Poll until succeeded / failed (max ~60s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': settings.docIntelKey },
    });
    const data = await poll.json();
    if (data.status === 'succeeded') {
      return mapResult(data.analyzeResult);
    }
    if (data.status === 'failed') {
      throw new Error(`Document Intelligence analysis failed: ${JSON.stringify(data.error ?? {})}`);
    }
  }
  throw new Error('Document Intelligence analysis timed out');
}

interface RawCell {
  rowIndex: number;
  columnIndex: number;
  content: string;
}
interface RawTable {
  rowCount: number;
  columnCount: number;
  cells: RawCell[];
}
interface RawAnalyzeResult {
  content?: string;
  pages?: unknown[];
  tables?: RawTable[];
}

function mapResult(result: RawAnalyzeResult): DocIntelResult {
  const tables: string[][][] = (result.tables ?? []).map((t) => {
    const grid: string[][] = Array.from({ length: t.rowCount }, () =>
      Array.from({ length: t.columnCount }, () => '')
    );
    for (const cell of t.cells) {
      if (grid[cell.rowIndex]) grid[cell.rowIndex][cell.columnIndex] = cell.content ?? '';
    }
    return grid;
  });

  return {
    content: result.content ?? '',
    tables,
    pageCount: result.pages?.length ?? 0,
  };
}
