/**
 * IPCR PDF generator (Employee Portal · "My IPCR Workspace" Phase 2 submit).
 *
 * Renders the completed IPCR in the official CSC/DBM Individual Performance
 * Commitment and Review layout:
 *   - Commitment header ("I, <name>, <position> at <office>, commit to deliver…")
 *   - Main table: MFO/PAP · Success Indicators (Targets+Measures) · Actual
 *     Accomplishments · Rating (Q | E | T | A) · Remarks, with the functions
 *     grouped under CORE FUNCTIONS / STRATEGIC PRIORITY / SUPPORT FUNCTIONS
 *   - Rating-scale legend
 *   - Average Rating summary table (Category · Average · % Weight · Rating,
 *     down to Total Overall / Final Average / Adjectival)
 *   - Signature blocks (Discussed with / Assessed by / Final Rating by)
 *
 * The workspace captures a single self-rating per function, so that value is
 * placed in the Average (A) rating column; Q/E/T are left blank for the rater.
 * Returned as a File for upload via the existing uploadEmployeeDocument() helper.
 */

import { jsPDF } from 'jspdf';

export interface IpcrPdfRow {
  category: string;
  target: string;
  accomplishment: string;
  rating: number | null;
}

export interface IpcrPdfData {
  employeeName: string;
  employeeNum: string;
  position: string;
  department: string;
  period: string;
  rows: IpcrPdfRow[];
  overallScore: number | null;
  adjectival: string | null;
}

const sanitize = (s: string) => (s || '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'ipcr';

export function ipcrPdfFileName(data: IpcrPdfData): string {
  return `IPCR-${sanitize(data.period)}-${sanitize(data.employeeNum || data.employeeName)}.pdf`;
}

const fmtRating = (r: number | null | undefined): string =>
  r !== null && r !== undefined && !Number.isNaN(r) ? Number(r).toFixed(2) : '';

/** Map a row's free-form category label onto one of the three IPCR sections. */
const sectionOf = (category: string): 'core' | 'strategic' | 'support' => {
  const c = (category || '').toLowerCase();
  if (c.includes('strateg')) return 'strategic';
  if (c.includes('support')) return 'support';
  return 'core';
};

/** Build the IPCR summary PDF and return it as a File. */
export function generateIpcrPdf(data: IpcrPdfData): File {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableW = pageW - margin * 2;

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW (IPCR)', pageW / 2, margin, {
    align: 'center',
  });

  // ── Commitment sentence ──────────────────────────────────────────────────
  let y = margin + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const commit =
    `I, ${data.employeeName || '—'}, ${data.position || '—'} of ${data.department || '—'}, ` +
    `commit to deliver and agree to be rated on the attainment of the following targets in ` +
    `accordance with the indicated measures for the period ${data.period || '—'}.`;
  const commitLines = doc.splitTextToSize(commit, usableW);
  doc.text(commitLines, margin, y);
  y += commitLines.length * 4 + 3;

  // ── Signatory header (Reviewed by / Approved by / Date) ──────────────────
  doc.setFontSize(8);
  const sigColW = usableW / 3;
  const sigRow = (labels: string[]) => {
    labels.forEach((lbl, i) => doc.text(lbl, margin + sigColW * i, y));
    y += 5;
  };
  sigRow(['Reviewed by:', 'Approved by:', `Date: ${new Date().toLocaleDateString()}`]);
  y += 1;

  // ── Main table geometry ──────────────────────────────────────────────────
  // MFO/PAP | Success Indicators | Actual Accomplishments | Rating(Q|E|T|A) | Remarks
  const ratingW = 28; // 4 sub-columns of 7mm
  const remarksW = 14;
  const mfoW = 34;
  const restW = usableW - mfoW - ratingW - remarksW; // split between indicators + accomplishments
  const indicW = restW / 2;
  const accW = restW - indicW;
  const sub = ratingW / 4;

  const colX = {
    mfo: margin,
    indic: margin + mfoW,
    acc: margin + mfoW + indicW,
    rating: margin + mfoW + indicW + accW,
    remarks: margin + mfoW + indicW + accW + ratingW,
  };
  const pad = 1.5;
  const lineH = 3.6;

  const drawTableHeader = () => {
    const h1 = 5; // top tier
    const h2 = 4.5; // sub tier (Q/E/T/A)
    const total = h1 + h2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setDrawColor(120);
    doc.setFillColor(238, 241, 250);
    doc.rect(margin, y, usableW, total, 'F');

    // Full-height columns (span both tiers)
    const fullCols: Array<{ x: number; w: number; title: string }> = [
      { x: colX.mfo, w: mfoW, title: 'MFO / PAP' },
      { x: colX.indic, w: indicW, title: 'Success Indicators (Targets + Measures)' },
      { x: colX.acc, w: accW, title: 'Actual Accomplishments' },
      { x: colX.remarks, w: remarksW, title: 'Remarks' },
    ];
    for (const c of fullCols) {
      doc.rect(c.x, y, c.w, total);
      const lines = doc.splitTextToSize(c.title, c.w - pad * 2);
      doc.text(lines, c.x + pad, y + 3);
    }
    // Rating group cell + Q/E/T/A subcells
    doc.rect(colX.rating, y, ratingW, h1);
    doc.text('Rating', colX.rating + ratingW / 2, y + 3.5, { align: 'center' });
    ['Q', 'E', 'T', 'A'].forEach((s, i) => {
      const sx = colX.rating + sub * i;
      doc.rect(sx, y + h1, sub, h2);
      doc.text(s, sx + sub / 2, y + h1 + 3.2, { align: 'center' });
    });
    y += total;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
    }
  };

  const drawSectionBanner = (title: string) => {
    const h = 5;
    ensureSpace(h);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, usableW, h, 'FD');
    doc.text(title, margin + pad, y + 3.4);
    y += h;
  };

  const drawFunctionRow = (row: IpcrPdfRow) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const mfoLines = doc.splitTextToSize(row.category || '—', mfoW - pad * 2) as string[];
    const indicLines = doc.splitTextToSize(row.target || '—', indicW - pad * 2) as string[];
    const accLines = doc.splitTextToSize(row.accomplishment || '—', accW - pad * 2) as string[];
    const maxLines = Math.max(1, mfoLines.length, indicLines.length, accLines.length);
    const rowH = maxLines * lineH + pad * 2;

    ensureSpace(rowH);

    // borders
    doc.setDrawColor(150);
    doc.rect(colX.mfo, y, mfoW, rowH);
    doc.rect(colX.indic, y, indicW, rowH);
    doc.rect(colX.acc, y, accW, rowH);
    ['Q', 'E', 'T', 'A'].forEach((_s, i) => doc.rect(colX.rating + sub * i, y, sub, rowH));
    doc.rect(colX.remarks, y, remarksW, rowH);

    // text
    doc.text(mfoLines, colX.mfo + pad, y + pad + 2.6);
    doc.text(indicLines, colX.indic + pad, y + pad + 2.6);
    doc.text(accLines, colX.acc + pad, y + pad + 2.6);
    // single self-rating goes into the Average (A) sub-column
    doc.text(fmtRating(row.rating), colX.rating + sub * 3 + sub / 2, y + rowH / 2 + 1, {
      align: 'center',
    });
    y += rowH;
  };

  drawTableHeader();

  const sections: Array<{ key: 'core' | 'strategic' | 'support'; title: string }> = [
    { key: 'core', title: 'CORE FUNCTIONS' },
    { key: 'strategic', title: 'STRATEGIC PRIORITY' },
    { key: 'support', title: 'SUPPORT FUNCTIONS' },
  ];
  for (const sec of sections) {
    drawSectionBanner(sec.title);
    const rowsForSec = data.rows.filter((r) => sectionOf(r.category) === sec.key);
    if (rowsForSec.length === 0) {
      drawFunctionRow({ category: '—', target: '—', accomplishment: '—', rating: null });
    } else {
      rowsForSec.forEach(drawFunctionRow);
    }
  }

  // ── Rating scale legend ──────────────────────────────────────────────────
  y += 3;
  ensureSpace(6);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(90);
  doc.text(
    'Rating Scale:  5 - Outstanding   4 - Very Satisfactory   3 - Satisfactory   2 - Unsatisfactory   1 - Poor',
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 6;

  // ── Average Rating summary table ─────────────────────────────────────────
  const byKey = (k: 'core' | 'strategic' | 'support') =>
    data.rows.find((r) => sectionOf(r.category) === k)?.rating ?? null;

  ensureSpace(48);
  const sumX = margin;
  const sc = { cat: 66, avg: 30, wt: 30, rate: 30 };
  const sumW = sc.cat + sc.avg + sc.wt + sc.rate;
  const rowHt = 5;
  const sumRow = (
    cat: string,
    avg: string,
    wt: string,
    rate: string,
    opts: { header?: boolean; bold?: boolean } = {},
  ) => {
    if (opts.header) {
      doc.setFillColor(238, 241, 250);
      doc.rect(sumX, y, sumW, rowHt, 'F');
    }
    doc.setFont('helvetica', opts.header || opts.bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setDrawColor(150);
    doc.rect(sumX, y, sc.cat, rowHt);
    doc.rect(sumX + sc.cat, y, sc.avg, rowHt);
    doc.rect(sumX + sc.cat + sc.avg, y, sc.wt, rowHt);
    doc.rect(sumX + sc.cat + sc.avg + sc.wt, y, sc.rate, rowHt);
    doc.text(cat, sumX + pad, y + 3.4);
    doc.text(avg, sumX + sc.cat + sc.avg / 2, y + 3.4, { align: 'center' });
    doc.text(wt, sumX + sc.cat + sc.avg + sc.wt / 2, y + 3.4, { align: 'center' });
    doc.text(rate, sumX + sc.cat + sc.avg + sc.wt + sc.rate / 2, y + 3.4, { align: 'center' });
    y += rowHt;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Average Rating', sumX, y - 1);
  y += 2;
  sumRow('Category', 'Average', '% Weight', 'Rating', { header: true });
  sumRow('Strategic Priority', fmtRating(byKey('strategic')), '', fmtRating(byKey('strategic')));
  sumRow('Core Functions', fmtRating(byKey('core')), '', fmtRating(byKey('core')));
  sumRow('Support Functions', fmtRating(byKey('support')), '', fmtRating(byKey('support')));
  sumRow('Total Overall Rating', '', '', fmtRating(data.overallScore), { bold: true });
  sumRow('Final Average Rating', '', '', fmtRating(data.overallScore), { bold: true });
  sumRow('Adjectival Rating', '', '', data.adjectival || '', { bold: true });

  // ── Signature blocks ─────────────────────────────────────────────────────
  y += 8;
  ensureSpace(20);
  const sigW = usableW / 3;
  const sigBlock = (i: number, roleLabel: string, name: string, subLabel: string) => {
    const x = margin + sigW * i;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(roleLabel, x, y);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(name || '____________________', x, y + 8);
    doc.setDrawColor(150);
    doc.line(x, y + 9, x + sigW - 6, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(90);
    doc.text(subLabel, x, y + 12.5);
    doc.setTextColor(0);
  };
  sigBlock(0, 'Discussed with:', data.employeeName, 'Employee · Signature over Printed Name / Date');
  sigBlock(1, 'Assessed by:', '', 'Immediate Supervisor / Date');
  sigBlock(2, 'Final Rating by:', '', 'Head of Office / Date');
  y += 18;

  // ── Footer ───────────────────────────────────────────────────────────────
  ensureSpace(8);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(120);
  doc.text('Legend:  1 - Quality   2 - Efficiency   3 - Timeliness   4 - Average', margin, y);
  y += 4;
  doc.text(
    `System-generated on ${new Date().toLocaleString()} · CICTrix Performance Management`,
    margin,
    y,
  );
  doc.setTextColor(0);

  const blob = doc.output('blob');
  return new File([blob], ipcrPdfFileName(data), { type: 'application/pdf' });
}
