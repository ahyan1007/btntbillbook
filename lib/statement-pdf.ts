import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';

export type PartyStatementTransaction = {
  date: string;
  type: 'Bill' | 'Payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type PartyStatementPdfData = {
  companyName: string;
  partyName: string;
  partyPhone?: string | null;
  partyAddress?: string | null;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalBills: number;
  totalPayments: number;
  closingBalance: number;
  transactions: PartyStatementTransaction[];
};

const NAVY = [15, 23, 42] as const;
const BLUE = [20, 135, 201] as const;
const ORANGE = [247, 148, 29] as const;
const MUTED = [100, 116, 139] as const;
const LIGHT = [246, 249, 252] as const;

function amount(value: number) {
  return 'INR ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  if (!value) return '—';
  const parsed = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function footer(doc: jsPDF, companyName: string) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 285, 210, 12, 'F');
    doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
    doc.rect(0, 285, 210, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(companyName || 'Bangladesh Tours & Travels', 12, 291.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Party Statement  •  Page ' + page + ' of ' + pageCount, 198, 291.5, { align: 'right' });
  }
}

export async function buildPartyStatementPdf(data: PartyStatementPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true, precision: 2 });
  let brand: any = null;
  try {
    const result = await supabase
      .from('business_settings')
      .select('company_name,tagline,address,phone,email,website,primary_color,accent_color')
      .maybeSingle();
    brand = result.data;
  } catch {
    // Keep a readable default branded report if settings are unavailable.
  }

  const companyName = brand?.company_name || data.companyName || 'Bangladesh Tours & Travels';
  const primary = String(brand?.primary_color || '#0f172a').replace('#', '');
  const accent = String(brand?.accent_color || '#f7941d').replace('#', '');
  const isHex = (value: string) => /^[0-9a-fA-F]{6}$/.test(value);
  const primaryRgb = isHex(primary)
    ? [parseInt(primary.slice(0, 2), 16), parseInt(primary.slice(2, 4), 16), parseInt(primary.slice(4, 6), 16)]
    : [...NAVY];
  const accentRgb = isHex(accent)
    ? [parseInt(accent.slice(0, 2), 16), parseInt(accent.slice(2, 4), 16), parseInt(accent.slice(4, 6), 16)]
    : [...ORANGE];

  // Compact branded header, designed to print clearly and stay lightweight.
  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.rect(0, 0, 210, 39, 'F');
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(0, 0, 210, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize(companyName, 125).slice(0, 1), 12, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(226, 232, 240);
  const tagline = brand?.tagline || 'Your Trusted Travel Partner';
  doc.text(doc.splitTextToSize(String(tagline), 125).slice(0, 1), 12, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('PARTY STATEMENT', 198, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(226, 232, 240);
  doc.text(formatDate(data.fromDate) + '  —  ' + formatDate(data.toDate), 198, 25, { align: 'right' });

  // Party details.
  doc.setFillColor(LIGHT[0], LIGHT[1], LIGHT[2]);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, 46, 186, 28, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text('PARTY / CUSTOMER', 17, 53);
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(doc.splitTextToSize(data.partyName || 'Customer', 110).slice(0, 1), 17, 61);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const contact = [data.partyPhone, data.partyAddress].filter(Boolean).join('  •  ');
  if (contact) doc.text(doc.splitTextToSize(contact, 174).slice(0, 1), 17, 69);

  // Compact totals strip.
  const cards = [
    { label: 'OPENING BALANCE', value: data.openingBalance },
    { label: 'BILLS IN PERIOD', value: data.totalBills },
    { label: 'PAYMENTS IN PERIOD', value: data.totalPayments },
    { label: data.closingBalance < 0 ? 'CUSTOMER ADVANCE' : data.closingBalance > 0 ? 'CLOSING BALANCE' : 'BALANCE SETTLED', value: data.closingBalance < 0 ? Math.abs(data.closingBalance) : data.closingBalance },
  ];
  const cardY = 81;
  const cardW = 44.5;
  cards.forEach((card, index) => {
    const x = 12 + index * 47;
    doc.setFillColor(index === 3 ? accentRgb[0] : 246, index === 3 ? accentRgb[1] : 249, index === 3 ? accentRgb[2] : 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardW, 20, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(index === 3 ? 255 : MUTED[0], index === 3 ? 255 : MUTED[1], index === 3 ? 255 : MUTED[2]);
    doc.text(card.label, x + 3, cardY + 6);
    doc.setFontSize(7);
    doc.setTextColor(index === 3 ? 255 : NAVY[0], index === 3 ? 255 : NAVY[1], index === 3 ? 255 : NAVY[2]);
    doc.text(doc.splitTextToSize(amount(card.value), cardW - 6).slice(0, 1), x + 3, cardY + 14);
  });

  let y = 110;
  const drawTableHeader = () => {
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.roundedRect(12, y, 186, 10, 1.8, 1.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text('DATE', 15, y + 6.5);
    doc.text('TYPE', 38, y + 6.5);
    doc.text('REFERENCE', 58, y + 6.5);
    doc.text('DETAILS', 86, y + 6.5);
    doc.text('DEBIT', 143, y + 6.5, { align: 'right' });
    doc.text('CREDIT', 166, y + 6.5, { align: 'right' });
    doc.text('BALANCE', 195, y + 6.5, { align: 'right' });
    y += 13;
  };
  drawTableHeader();

  for (let index = 0; index < data.transactions.length; index += 1) {
    const row = data.transactions[index];
    const descriptionLines = doc.splitTextToSize(row.description || '—', 45).slice(0, 2);
    const rowH = Math.max(8, descriptionLines.length * 3.2 + 3.8);
    if (y + rowH > 279) {
      doc.addPage();
      y = 18;
      drawTableHeader();
    }
    if (index % 2 === 0) {
      doc.setFillColor(249, 251, 253);
      doc.rect(12, y - 4, 186, rowH, 'F');
    }
    doc.setDrawColor(232, 237, 243);
    doc.line(12, y + rowH - 1, 198, y + rowH - 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(formatDate(row.date), 15, y);
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.text(row.type, 38, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(row.reference || '—', 25).slice(0, 1), 58, y);
    doc.text(descriptionLines, 86, y);
    doc.setTextColor(...NAVY);
    if (row.debit > 0) doc.text(amount(row.debit), 143, y, { align: 'right' });
    if (row.credit > 0) {
      doc.setTextColor(5, 150, 105);
      doc.text(amount(row.credit), 166, y, { align: 'right' });
    }
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.text(amount(row.balance), 195, y, { align: 'right' });
    y += rowH;
  }

  if (!data.transactions.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('No bills or payments were recorded for this period.', 15, y + 5);
    y += 12;
  }

  // Compact closing balance summary, on a new page when there is no room.
  if (y + 20 > 282) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.roundedRect(112, y + 4, 86, 15, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(data.closingBalance < 0 ? 'CUSTOMER ADVANCE' : data.closingBalance > 0 ? 'CLOSING BALANCE' : 'BALANCE SETTLED', 117, y + 13);
  doc.setFontSize(9);
  doc.text(amount(data.closingBalance < 0 ? Math.abs(data.closingBalance) : data.closingBalance), 193, y + 13, { align: 'right' });

  footer(doc, companyName);
  return doc;
}
