/**
 * Rasterize a PDF into page images (PNG base64) so vision models can OCR scanned,
 * image-only PDFs reliably. Native PDF parsing varies a lot across providers and
 * fails on scanned documents; rendering each page to an image and sending it as an
 * image part gives consistent OCR everywhere.
 */

import * as pdfjs from 'pdfjs-dist';
// Bundle the worker with Vite (resolved to a URL at build time).
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

export interface RenderedPage {
  base64: string; // PNG, no data: prefix
  mimeType: 'image/png';
}

/**
 * Render up to `maxPages` pages of a PDF to PNG images.
 * @param scale render scale (2 ≈ ~150 DPI, good for OCR without huge payloads)
 */
export async function pdfToImages(
  file: Blob,
  maxPages = 8,
  scale = 2,
): Promise<RenderedPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];
  const count = Math.min(doc.numPages, maxPages);

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    pages.push({ base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/png' });
    canvas.width = 0;
    canvas.height = 0;
  }

  await doc.destroy();
  return pages;
}
