/**
 * F24 PDF generator (MVP) — faithful "Sezione IMU e altri tributi locali" layout.
 *
 * Reproduces the structure of the official F24 model: the CONTRIBUENTE block
 * (dati anagrafici + domicilio fiscale + codice fiscale) and the IMU section table
 * with the official columns (codice ente, ravv., immob. variati, acconto, saldo,
 * numero immobili, codice tributo, rateazione/mese rif., anno di riferimento,
 * importi a debito versati, importi a credito compensati) plus TOTALE / SALDO.
 *
 * It is a clean, print-ready approximation — not a byte-for-byte copy of the Agenzia
 * delle Entrate PDF — but every official field that matters for IMU is present.
 */

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Taxpayer, TaxCalculation } from '../../types';

const SKY = rgb(0.05, 0.55, 0.85);
const DARK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.45, 0.5, 0.55);
const LINE = rgb(0.78, 0.81, 0.85);

function formatAmount(n: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatItDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function text(ctx: Ctx, s: string, x: number, y: number, size = 9, useBold = false, color = DARK) {
  ctx.page.drawText(s, { x, y, size, font: useBold ? ctx.bold : ctx.font, color });
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, color = LINE, thickness = 0.7) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: thickness });
}

function vline(ctx: Ctx, x: number, yTop: number, yBottom: number, color = LINE, thickness = 0.5) {
  ctx.page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness, color });
}

export async function generateF24Pdf(
  calculation: TaxCalculation,
  taxpayer: Taxpayer
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const ctx: Ctx = {
    page,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const left = 40;
  const right = 555;
  const width = right - left;
  let y = 800;

  // ── Header ──────────────────────────────────────────────────────────────────
  text(ctx, 'Taxtoo', left, y, 20, true, SKY);
  text(ctx, 'Mod. F24', right - 70, y, 12, true, GRAY);
  y -= 14;
  text(ctx, 'DELEGA IRREVOCABILE A BANCA / POSTE / AGENTE DELLA RISCOSSIONE', left, y, 7.5, false, GRAY);
  y -= 20;

  // ── CONTRIBUENTE ────────────────────────────────────────────────────────────
  text(ctx, 'CONTRIBUENTE', left, y, 9, true, SKY);
  y -= 6;
  box(ctx, left, y - 86, width, 86);

  let cy = y - 14;
  text(ctx, 'CODICE FISCALE', left + 6, cy, 7, true, GRAY);
  text(ctx, calculation.taxpayerFiscalCode || taxpayer.fiscalCode, left + 110, cy, 11, true);
  cy -= 18;

  text(ctx, 'Cognome, denominazione o ragione sociale', left + 6, cy, 7, true, GRAY);
  text(ctx, 'Nome', left + 300, cy, 7, true, GRAY);
  cy -= 13;
  text(ctx, (taxpayer.lastName || '').toUpperCase(), left + 6, cy, 10, true);
  text(ctx, (taxpayer.firstName || '').toUpperCase(), left + 300, cy, 10, true);
  cy -= 16;

  text(ctx, 'Data di nascita', left + 6, cy, 7, true, GRAY);
  text(ctx, 'Sesso', left + 120, cy, 7, true, GRAY);
  text(ctx, 'Comune (o Stato estero) di nascita', left + 170, cy, 7, true, GRAY);
  text(ctx, 'Prov.', left + 420, cy, 7, true, GRAY);
  cy -= 13;
  text(ctx, taxpayer.birthDate ? formatItDate(taxpayer.birthDate) : '', left + 6, cy, 9);
  text(ctx, taxpayer.sex ?? '', left + 120, cy, 9);
  text(ctx, (taxpayer.birthPlace ?? '').toUpperCase(), left + 170, cy, 9);
  text(ctx, (taxpayer.birthProvince ?? '').toUpperCase(), left + 420, cy, 9);
  cy -= 16;

  text(ctx, 'DOMICILIO FISCALE \u2014 Comune', left + 6, cy, 7, true, GRAY);
  text(ctx, 'Prov.', left + 230, cy, 7, true, GRAY);
  text(ctx, 'Via e numero civico', left + 280, cy, 7, true, GRAY);
  cy -= 13;
  text(ctx, (taxpayer.domicileMunicipality ?? '').toUpperCase(), left + 6, cy, 9);
  text(ctx, (taxpayer.domicileProvince ?? '').toUpperCase(), left + 230, cy, 9);
  text(ctx, (taxpayer.address ?? '').toUpperCase(), left + 280, cy, 9);

  y -= 100;

  // ── SEZIONE IMU E ALTRI TRIBUTI LOCALI ──────────────────────────────────────
  text(ctx, 'SEZIONE IMU E ALTRI TRIBUTI LOCALI', left, y, 9, true, SKY);
  y -= 8;

  const cols = [
    { label: 'codice ente/\ncod. comune', x: left },
    { label: 'ravv.', x: left + 70 },
    { label: 'immob.\nvariati', x: left + 98 },
    { label: 'acc.', x: left + 132 },
    { label: 'saldo', x: left + 158 },
    { label: 'num.\nimmob.', x: left + 188 },
    { label: 'codice\ntributo', x: left + 226 },
    { label: 'rateazione/\nmese rif.', x: left + 276 },
    { label: 'anno di\nriferimento', x: left + 332 },
    { label: 'importi a debito\nversati', x: left + 390 },
    { label: 'importi a credito\ncompensati', x: left + 480 },
  ];

  const headTop = y;
  const headH = 22;
  box(ctx, left, headTop - headH, width, headH, GRAY, 0.8);
  for (const c of cols) {
    if (c.x > left) vline(ctx, c.x, headTop, headTop - headH, LINE, 0.6);
    c.label.split('\n').forEach((ln, i) => {
      text(ctx, ln, c.x + 2, headTop - 9 - i * 8, 5.6, true, GRAY);
    });
  }

  let ry = headTop - headH;
  const rowH = 18;
  const flagFor = (inst?: string) => (inst === 'acconto' ? 'acc' : inst === 'saldo' ? 'saldo' : '');

  for (const row of calculation.rows) {
    box(ctx, left, ry - rowH, width, rowH, LINE, 0.5);
    for (const c of cols) {
      if (c.x > left) vline(ctx, c.x, ry, ry - rowH, LINE, 0.4);
    }
    const flag = flagFor(row.installment);
    text(ctx, calculation.municipalityCode, left + 4, ry - 12, 9, true);
    if (flag === 'acc') text(ctx, 'X', left + 142, ry - 12, 9, true);
    if (flag === 'saldo') text(ctx, 'X', left + 169, ry - 12, 9, true);
    text(ctx, row.taxCode, left + 230, ry - 12, 9, true);
    text(ctx, String(calculation.year), left + 350, ry - 12, 9);
    text(ctx, formatAmount(row.amount), left + 392, ry - 12, 9);
    ry -= rowH;
  }

  // Totals row
  box(ctx, left, ry - rowH, width, rowH, GRAY, 0.7);
  text(ctx, 'TOTALE', left + 230, ry - 12, 8, true, GRAY);
  text(ctx, 'A', left + 372, ry - 12, 8, true, GRAY);
  text(ctx, formatAmount(calculation.total), left + 392, ry - 12, 9, true);
  text(ctx, 'B', left + 470, ry - 12, 8, true, GRAY);
  text(ctx, '0,00', left + 482, ry - 12, 9);
  ry -= rowH + 8;

  // SALDO (A - B)
  text(ctx, 'SALDO (A - B)', left + 300, ry - 12, 9, true, DARK);
  box(ctx, left + 390, ry - 18, 90, 20, SKY, 1);
  text(ctx, formatAmount(calculation.total), left + 396, ry - 12, 11, true, SKY);
  text(ctx, 'EUR', left + 488, ry - 12, 9, false, GRAY);

  // ── Footer ──────────────────────────────────────────────────────────────────
  text(
    ctx,
    `Generato da Taxtoo \u00b7 engine v${calculation.engineVersion} \u00b7 ${new Date().toLocaleDateString('it-IT')} \u00b7 documento di supporto, non sostituisce il modello ufficiale dell'Agenzia delle Entrate`,
    left,
    36,
    6.5,
    false,
    GRAY
  );

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
