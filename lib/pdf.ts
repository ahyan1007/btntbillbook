import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';

export type BillPdfItem = {
  passenger_name: string;
  travel_date?: string | null;
  service_type?: string | null;
  details?: string | null;
  amount: number;
};

export type BillPdfData = {
  billNo: string;
  billDate: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  previousDue: number;
  subtotal: number;
  paidNow: number;
  totalDue: number;
  items: BillPdfItem[];
};

export type PaymentPdfData = {
  paymentNo: string;
  paymentDate: string;
  customerName: string;
  customerPhone?: string | null;
  amount: number;
  method: string;
  previousDue: number;
  remainingDue: number;
  note?: string | null;
};

const BLUE = [13, 74, 128] as const;
const BLUE_2 = [29, 137, 203] as const;
const ORANGE = [247, 148, 29] as const;
const INK = [15, 23, 42] as const;
const MUTED = [90, 105, 125] as const;
const LINE = [210, 222, 235] as const;
const PALE_BLUE = [240, 247, 253] as const;
const PALE_ORANGE = [255, 247, 236] as const;
const PALE_GREEN = [236, 250, 243] as const;
const GREEN = [16, 160, 100] as const;
const WHITE = [255, 255, 255] as const;

function money(value: number) {
  return 'BDT ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function dateText(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function textOrDash(value?: string | null) {
  return value?.trim() ? value.trim() : '—';
}

async function logoDataUrl(customUrl?: string | null) {
  try {
    const sourceUrl = customUrl || '/logo.svg';
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Logo fetch failed');

    const svg = sourceUrl.toLowerCase().includes('.svg') ? await response.text() : null;
    const blob = svg
      ? new Blob([svg], { type: 'image/svg+xml' })
      : await response.blob();

    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Logo load failed'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function drawPlane(doc: jsPDF, x: number, y: number, scale = 1) {
  doc.setDrawColor(...BLUE);
  doc.setFillColor(...BLUE);
  doc.setLineWidth(0.7 * scale);

  doc.line(x, y + 2 * scale, x + 14 * scale, y - 2 * scale);
  doc.line(x + 14 * scale, y - 2 * scale, x + 19 * scale, y + 1 * scale);
  doc.line(x + 14 * scale, y - 2 * scale, x + 11 * scale, y - 6 * scale);
  doc.line(x + 10 * scale, y + 1 * scale, x + 4 * scale, y + 8 * scale);
  doc.line(x + 10 * scale, y + 1 * scale, x + 7 * scale, y - 4 * scale);

  doc.setLineWidth(0.45 * scale);
  doc.line(x - 2 * scale, y + 4 * scale, x + 5 * scale, y + 2 * scale);
}

function drawTravelHeader(doc: jsPDF, logo: string | null, documentTitle: string, subtitle: string) {
  // White premium header
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, 210, 58, 'F');

  // Soft right-side travel panel
  doc.setFillColor(246, 250, 255);
  doc.rect(118, 0, 92, 58, 'F');

  // Stylized skyline / travel illustration
  doc.setFillColor(...BLUE);
  doc.rect(151, 37, 5, 21, 'F');
  doc.rect(159, 29, 7, 29, 'F');
  doc.rect(169, 34, 5, 24, 'F');
  doc.rect(177, 24, 8, 34, 'F');
  doc.rect(189, 31, 5, 27, 'F');
  doc.rect(198, 39, 4, 19, 'F');

  doc.setFillColor(...ORANGE);
  doc.rect(151, 37, 5, 1.2, 'F');
  doc.rect(159, 29, 7, 1.2, 'F');
  doc.rect(177, 24, 8, 1.2, 'F');

  // Globe
  doc.setDrawColor(...BLUE_2);
  doc.setLineWidth(0.7);
  doc.circle(173, 35, 12, 'S');
  doc.ellipse(173, 35, 5.2, 12, 'S');
  doc.line(161, 35, 185, 35);
  doc.line(163, 29, 183, 29);
  doc.line(163, 41, 183, 41);

  // Decorative flight path
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.8);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(121, 18, 147, 12);
  doc.line(147, 12, 157, 15);
  doc.setLineDashPattern([], 0);
  drawPlane(doc, 143, 13, 0.8);

  // Brand block
  if (logo) doc.addImage(logo, 'PNG', 12, 8, 72, 25);

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bangladesh Tours & Travels', 12, 40);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Your Trusted Travel Partner', 12, 46);

  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('AIR TICKET  •  TOUR PACKAGE  •  VISA  •  HOTEL', 12, 52);

  // Orange / blue wave divider
  doc.setFillColor(...ORANGE);
  doc.triangle(0, 56, 0, 60, 112, 60, 'F');
  doc.setFillColor(...BLUE);
  doc.triangle(98, 55, 210, 55, 210, 60, 'F');

  // Document title overlay
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(documentTitle.toUpperCase(), 187, 56.5, { align: 'right' });

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(subtitle.toUpperCase(), 12, 63);
}

function sectionTitle(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
  accent: readonly [number, number, number] = BLUE_2,
) {
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 5, 12, 1.5, 1.5, 'F');

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(title, x + 9, y + 8.5);
}

function infoCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  accent: readonly [number, number, number],
  fill: readonly [number, number, number],
) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, w, h, 4, 4, 'FD');

  doc.setFillColor(...accent);
  doc.roundedRect(x + 4, y + 5, 8, 8, 2, 2, 'F');

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(title, x + 16, y + 10.5);
}

function metaCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
) {
  doc.setFillColor(246, 250, 255);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, w, 18, 3.5, 3.5, 'FD');

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text(label.toUpperCase(), x + 5, y + 6.5);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(textOrDash(value), x + 5, y + 13.5);
}

function footer(doc: jsPDF) {
  doc.setFillColor(...BLUE);
  doc.rect(0, 284, 210, 13, 'F');

  doc.setFillColor(...ORANGE);
  doc.rect(0, 284, 210, 1.5, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Bangladesh Tours & Travels  •  Professional Travel Services', 12, 292.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Computer generated document', 198, 292.5, { align: 'right' });
}

function customerCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  phone?: string | null,
  address?: string | null,
  title = 'Billed To',
) {
  infoCard(doc, x, y, w, h, title, ORANGE, PALE_ORANGE);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(textOrDash(name), x + 6, y + 22);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);

  let lineY = y + 30;
  if (phone) {
    doc.text(phone, x + 6, lineY);
    lineY += 7;
  }

  if (address) {
    const addressLines = doc.splitTextToSize(address, w - 12);
    doc.text(addressLines, x + 6, lineY);
  }
}

function travelCard(doc: jsPDF, x: number, y: number, w: number, h: number, items: BillPdfItem[]) {
  infoCard(doc, x, y, w, h, 'Travel Details', BLUE_2, PALE_BLUE);

  const firstDate = items.find((item) => item.travel_date)?.travel_date;
  const serviceNames = Array.from(
    new Set(items.map((item) => item.service_type?.trim()).filter(Boolean)),
  ).join('  •  ');

  const details = [
    ['Travel Date', firstDate ? dateText(firstDate) : '—'],
    ['Passengers', String(items.length)],
    ['Services', serviceNames || 'Travel Service'],
  ];

  doc.setFontSize(7.2);
  details.forEach(([label, value], index) => {
    const yy = y + 22 + index * 9;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 6, yy);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, w - 38);
    doc.text(valueLines, x + 34, yy);
  });
}

async function businessLogoUrl() {
  const { data } = await supabase
    .from('business_settings')
    .select('logo_url')
    .maybeSingle();

  return data?.logo_url || null;
}

function drawSummaryBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  previousDue: number,
  subtotal: number,
  paidNow: number,
  totalDue: number,
) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, w, 42, 4, 4, 'FD');

  sectionTitle(doc, x + 5, y + 4, 'Payment Summary', BLUE_2);

  const rows = [
    ['Previous Due', previousDue, MUTED],
    ["Today's Bill", subtotal, INK],
    ['Paid Now', paidNow, GREEN],
  ] as const;

  rows.forEach(([label, value, color], index) => {
    const yy = y + 20 + index * 6.8;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(label, x + 7, yy);

    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.text(money(value), x + w - 7, yy, { align: 'right' });
  });

  doc.setFillColor(...ORANGE);
  doc.roundedRect(x + 5, y + 42, w - 10, 16, 4, 4, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.text('TOTAL OUTSTANDING', x + 11, y + 52);

  doc.setFontSize(11);
  doc.text(money(totalDue), x + w - 11, y + 52, { align: 'right' });
}

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());

  drawTravelHeader(doc, logo, 'Booking Bill', 'Booking document / invoice');
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('BOOKING BILL', 15, 78);

  doc.setTextColor(...ORANGE);
  doc.setFontSize(13);
  doc.text('INVOICE', 15, 85);

  metaCard(doc, 130, 68, 65, 'Bill Number', data.billNo);
  metaCard(doc, 130, 89, 65, 'Bill Date', dateText(data.billDate));

  customerCard(
    doc,
    15,
    68,
    106,
    46,
    data.customerName,
    data.customerPhone,
    data.customerAddress,
  );

  travelCard(doc, 15, 118, 180, 44, data.items);

  // Table header
  const tableY = 168;
  doc.setFillColor(...BLUE);
  doc.roundedRect(15, tableY, 180, 11, 2.5, 2.5, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.7);
  doc.text('#', 19, tableY + 7);
  doc.text('PASSENGER', 27, tableY + 7);
  doc.text('TRAVEL DATE', 62, tableY + 7);
  doc.text('SERVICE / DETAILS', 91, tableY + 7);
  doc.text('AMOUNT (BDT)', 188, tableY + 7, { align: 'right' });

  let y = tableY + 17;

  for (let index = 0; index < data.items.length; index += 1) {
    const item = data.items[index];
    const detail = [item.service_type || 'Travel Service', item.details]
      .filter(Boolean)
      .join('  •  ');
    const detailLines = doc.splitTextToSize(detail, 73);
    const rowH = Math.max(13, detailLines.length * 4 + 7);

    if (y + rowH > 245) {
      doc.addPage();
      drawTravelHeader(doc, logo, 'Booking Bill', 'Booking document / invoice');
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('BOOKING BILL — CONTINUED', 15, 75);

      doc.setFillColor(...BLUE);
      doc.roundedRect(15, 82, 180, 11, 2.5, 2.5, 'F');
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.7);
      doc.text('#', 19, 89);
      doc.text('PASSENGER', 27, 89);
      doc.text('TRAVEL DATE', 62, 89);
      doc.text('SERVICE / DETAILS', 91, 89);
      doc.text('AMOUNT (BDT)', 188, 89, { align: 'right' });
      y = 99;
    }

    doc.setFillColor(index % 2 === 0 ? 249 : 244, index % 2 === 0 ? 251 : 248, 253);
    doc.setDrawColor(...LINE);
    doc.roundedRect(15, y - 6, 180, rowH, 2.5, 2.5, 'FD');

    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(String(index + 1), 19, y + 1);

    doc.setTextColor(...INK);
    doc.setFontSize(7.2);
    doc.text(textOrDash(item.passenger_name), 27, y + 1);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(item.travel_date ? dateText(item.travel_date) : '—', 62, y + 1);

    doc.setTextColor(...INK);
    doc.text(detailLines, 91, y + 1);

    doc.setFont('helvetica', 'bold');
    doc.text(money(item.amount), 188, y + 1, { align: 'right' });

    y += rowH + 2;
  }

  if (doc.getNumberOfPages() > 1) {
    footer(doc);
  }

  const summaryY = Math.min(Math.max(y + 4, 184), 222);
  drawSummaryBox(
    doc,
    15,
    summaryY,
    96,
    data.previousDue,
    data.subtotal,
    data.paidNow,
    data.totalDue,
  );

  // Important note / signature area on the right
  const noteX = 116;
  doc.setFillColor(...PALE_ORANGE);
  doc.setDrawColor(255, 221, 180);
  doc.roundedRect(noteX, summaryY, 79, 58, 4, 4, 'FD');

  sectionTitle(doc, noteX + 5, summaryY + 4, 'Important Note', ORANGE);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  const noteLines = [
    'Please make the remaining payment',
    'before the travel date.',
    'This is a system generated invoice',
    'and does not require a signature.',
    'For changes or cancellation, contact',
    'our support team.',
  ];
  noteLines.forEach((line, index) => {
    const yy = summaryY + 20 + index * 6.4;
    doc.setTextColor(index === 0 ? ORANGE[0] : MUTED[0], index === 0 ? ORANGE[1] : MUTED[1], index === 0 ? ORANGE[2] : MUTED[2]);
    doc.text(index === 0 ? '•  ' + line : '   ' + line, noteX + 7, yy);
  });

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Thank You', 188, summaryY + 50, { align: 'right' });
  doc.setTextColor(...ORANGE);
  doc.setFontSize(5.8);
  doc.text('For choosing Bangladesh Tours & Travels', 188, summaryY + 56, { align: 'right' });

  footer(doc);
  return doc;
}

export async function buildPaymentPdf(data: PaymentPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());

  drawTravelHeader(doc, logo, 'Payment Receipt', 'Official receipt / payment confirmation');
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text('PAYMENT RECEIPT', 15, 78);

  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('O F F I C I A L   R E C E I P T', 15, 85);

  metaCard(doc, 130, 68, 65, 'Receipt Number', data.paymentNo);
  metaCard(doc, 130, 89, 65, 'Payment Date', dateText(data.paymentDate));
  metaCard(doc, 130, 110, 65, 'Payment Method', data.method || 'Cash');

  customerCard(doc, 15, 92, 106, 52, data.customerName, data.customerPhone);

  infoCard(doc, 126, 137, 69, 34, 'Payment Reference', BLUE_2, PALE_BLUE);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Bill Book Payment', 132, 158);

  // Main green payment panel
  doc.setFillColor(...PALE_GREEN);
  doc.setDrawColor(186, 232, 210);
  doc.roundedRect(15, 150, 106, 66, 6, 6, 'FD');

  doc.setFillColor(...GREEN);
  doc.roundedRect(22, 158, 10, 10, 2.5, 2.5, 'F');
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(1.2);
  doc.line(25, 163, 27.4, 165.4);
  doc.line(27.4, 165.4, 31.0, 161.1);

  doc.setTextColor(...GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PAYMENT RECEIVED', 38, 165);

  doc.setTextColor(10, 103, 64);
  doc.setFontSize(20);
  doc.text(money(data.amount), 22, 187);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Payment successfully recorded', 22, 198);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.text('Thank you for your payment.', 22, 208);

  // Due summary
  doc.setFillColor(250, 250, 251);
  doc.setDrawColor(...LINE);
  doc.roundedRect(126, 176, 69, 73, 5, 5, 'FD');

  sectionTitle(doc, 132, 182, 'Account Summary', BLUE_2);

  const dueRows = [
    ['Previous Due', money(data.previousDue), MUTED],
    ['Payment Received', '− ' + money(data.amount), GREEN],
    ['Remaining Due', money(data.remainingDue), INK],
  ] as const;

  dueRows.forEach(([label, value, color], index) => {
    const yy = 202 + index * 12;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(label, 132, yy);
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.text(value, 189, yy, { align: 'right' });

    if (index < dueRows.length - 1) {
      doc.setDrawColor(...LINE);
      doc.line(132, yy + 4, 189, yy + 4);
    }
  });

  doc.setFillColor(255, 235, 232);
  doc.roundedRect(130, 234, 61, 11, 3, 3, 'F');
  doc.setTextColor(210, 45, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.7);
  doc.text('REMAINING DUE', 135, 241);
  doc.setFontSize(8.8);
  doc.text(money(data.remainingDue), 188, 241, { align: 'right' });

  // Receipt note
  const note = data.note?.trim() || 'This receipt confirms the payment recorded in the Bill Book.';
  doc.setFillColor(...PALE_BLUE);
  doc.setDrawColor(210, 228, 245);
  doc.roundedRect(15, 224, 106, 38, 5, 5, 'FD');

  sectionTitle(doc, 21, 229, 'Payment Note', BLUE_2);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.text(doc.splitTextToSize(note, 92), 21, 245);

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Thank You', 118, 270, { align: 'right' });

  doc.setTextColor(...ORANGE);
  doc.setFontSize(6);
  doc.text('For your payment and continued trust', 118, 277, { align: 'right' });

  footer(doc);
  return doc;
}

export async function sharePdf(doc: jsPDF, fileName: string, whatsappText: string) {
  const waWindow = window.open('https://web.whatsapp.com/', '_blank');
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  try {
    await navigator.clipboard?.writeText(whatsappText);
  } catch {}

  if (!waWindow) {
    window.location.href = 'https://web.whatsapp.com/';
  }
}

export async function sendPdfToWhatsApp(
  doc: jsPDF,
  fileName: string,
  phone?: string | null,
  message?: string,
) {
  if (!phone) throw new Error('Customer phone number is required for WhatsApp sending.');

  const blob = doc.output('blob');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  const pdfBase64 = btoa(binary);
  const { error } = await supabase.functions.invoke('send-whatsapp-pdf', {
    body: {
      phone,
      fileName,
      caption: message || '',
      pdfBase64,
    },
  });

  if (error) throw new Error(error.message || 'WhatsApp send failed.');
}
