/**
 * IPCR PDF generator (Employee Portal · "My IPCR Workspace" Phase 2 submit).
 *
 * Renders the completed IPCR — targets, accomplishments and self-ratings per
 * function, plus the computed overall score + adjectival rating — as a single
 * A4 page and returns it as a File so it can be uploaded to Supabase Storage
 * via the existing uploadEmployeeDocument() helper.
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

/** Build the IPCR summary PDF and return it as a File. */
export function generateIpcrPdf(data: IpcrPdfData): File {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const usableW = pageW - margin * 2;

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW', pageW / 2, margin, { align: 'center' });
  doc.setFontSize(10);
  doc.text('(IPCR)', pageW / 2, margin + 6, { align: 'center' });

  // ── Header block ───────────────────────────────────────────────────────────
  let y = margin + 16;
  doc.setFontSize(9);
  const line = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '—', margin + 34, y);
    y += 6;
  };
  line('Employee:', data.employeeName);
  line('Employee No.:', data.employeeNum);
  line('Position:', data.position);
  line('Department:', data.department);
  line('Rating Period:', data.period);
  y += 2;

  // ── Table ───────────────────────────────────────────────────────────────────
  const cols = [
    { key: 'category', title: 'Function', w: 30 },
    { key: 'target', title: 'Target / Success Indicator', w: 62 },
    { key: 'accomplishment', title: 'Actual Accomplishment', w: 62 },
    { key: 'rating', title: 'Rating', w: usableW - 30 - 62 - 62 },
  ] as const;
  const pad = 2;
  const lineH = 4;

  const drawHeaderRow = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setFillColor(240, 242, 252);
    doc.rect(margin, y, usableW, 8, 'F');
    let x = margin;
    for (const c of cols) {
      const lines = doc.splitTextToSize(c.title, c.w - pad * 2);
      doc.text(lines, x + pad, y + 5);
      x += c.w;
    }
    // vertical + outer borders for the header
    doc.setDrawColor(180);
    x = margin;
    for (const c of cols) {
      doc.rect(x, y, c.w, 8);
      x += c.w;
    }
    y += 8;
  };

  drawHeaderRow();
  doc.setFont('helvetica', 'normal');

  for (const row of data.rows) {
    const cellLines = cols.map((c) => {
      const raw =
        c.key === 'rating'
          ? row.rating !== null && row.rating !== undefined
            ? row.rating.toFixed(2)
            : '—'
          : (row as any)[c.key] || '—';
      return doc.splitTextToSize(String(raw), c.w - pad * 2) as string[];
    });
    const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
    const rowH = maxLines * lineH + pad * 2;

    // Page break if this row won't fit.
    if (y + rowH > pageH - margin - 18) {
      doc.addPage();
      y = margin;
      drawHeaderRow();
      doc.setFont('helvetica', 'normal');
    }

    let x = margin;
    cols.forEach((c, i) => {
      doc.rect(x, y, c.w, rowH);
      const isRating = c.key === 'rating';
      doc.text(cellLines[i], isRating ? x + c.w / 2 : x + pad, y + pad + 3, {
        align: isRating ? 'center' : 'left',
      });
      x += c.w;
    });
    y += rowH;
  }

  // ── Overall rating ───────────────────────────────────────────────────────────
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const scoreText =
    data.overallScore !== null && data.overallScore !== undefined
      ? `${data.overallScore.toFixed(2)}${data.adjectival ? ` — ${data.adjectival}` : ''}`
      : '—';
  doc.text(`Final Overall Rating:  ${scoreText}`, margin, y);

  y += 10;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `System-generated on ${new Date().toLocaleString()} · CICTrix Performance Management`,
    margin,
    y,
  );
  doc.setTextColor(0);

  const blob = doc.output('blob');
  return new File([blob], ipcrPdfFileName(data), { type: 'application/pdf' });
}
