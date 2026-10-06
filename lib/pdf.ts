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

type Rgb = readonly [number, number, number];

const NAVY: Rgb = [12, 63, 110];
const BLUE: Rgb = [29, 137, 203];
const ORANGE: Rgb = [247, 148, 29];
const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [90, 105, 125];
const LINE: Rgb = [211, 222, 234];
const PALE_BLUE: Rgb = [240, 247, 253];
const PALE_ORANGE: Rgb = [255, 247, 236];
const PALE_GREEN: Rgb = [236, 250, 243];
const GREEN: Rgb = [16, 160, 100];
const RED: Rgb = [220, 48, 40];
const WHITE: Rgb = [255, 255, 255];

function setFill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: Rgb) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: Rgb) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function money(value: number) {
  return 'BDT ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function dateText(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function textOrDash(value?: string | null) {
  return value?.trim() ? value.trim() : '—';
}

async function logoDataUrl(customUrl?: string | null) {
  try {
    const sourceUrl = customUrl || '/logo.svg';
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Logo fetch failed');

    const svg = sourceUrl.toLowerCase().endsWith('.svg') ? await response.text() : null;
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
  setDraw(doc, NAVY);
  doc.setLineWidth(0.7 * scale);
  doc.line(x, y, x + 16 * scale, y - 4 * scale);
  doc.line(x + 16 * scale, y - 4 * scale, x + 20 * scale, y);
  doc.line(x + 16 * scale, y - 4 * scale, x + 12 * scale, y - 8 * scale);
  doc.line(x + 11 * scale, y, x + 5 * scale, y + 7 * scale);
  doc.line(x + 11 * scale, y, x + 8 * scale, y - 5 * scale);
  doc.line(x - 2 * scale, y + 2 * scale, x + 5 * scale, y);
}

function drawHeader(doc: jsPDF, logo: string | null, documentTitle: string, subtitle: string) {
  // Main white header
  setFill(doc, WHITE);
  doc.rect(0, 0, 210, 59, 'F');

  // Right travel illustration panel
  setFill(doc, PALE_BLUE);
  doc.rect(118, 0, 92, 59, 'F');

  // Skyline made from simple safe primitives
  setFill(doc, NAVY);
  doc.rect(149, 39, 5, 20, 'F');
  doc.rect(157, 31, 7, 28, 'F');
  doc.rect(167, 36, 5, 23, 'F');
  doc.rect(175, 27, 8, 32, 'F');
  doc.rect(188, 34, 5, 25, 'F');
  doc.rect(197, 40, 4, 19, 'F');

  setFill(doc, ORANGE);
  doc.rect(149, 39, 5, 1.3, 'F');
  doc.rect(157, 31, 7, 1.3, 'F');
  doc.rect(175, 27, 8, 1.3, 'F');

  // Globe
  setDraw(doc, BLUE);
  doc.setLineWidth(0.7);
  doc.circle(175, 34, 12, 'S');
  doc.line(163, 34, 187, 34);
  doc.line(167, 26, 183, 42);
  doc.line(183, 26, 167, 42);

  // Flight path
  setDraw(doc, ORANGE);
  doc.setLineWidth(0.6);
  doc.line(121, 18, 139, 14);
  doc.line(139, 14, 148, 17);
  drawPlane(doc, 140, 14, 0.65);

  if (logo) {
    doc.addImage(logo, 'PNG', 12, 8, 72, 25);
  }

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bangladesh Tours & Travels', 12, 40);

  setText(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Your Trusted Travel Partner', 12, 46);

  setText(doc, ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('AIR TICKET  •  TOUR PACKAGE  •  VISA  •  HOTEL', 12, 52);

  // Decorative blue/orange lower band
  setFill(doc, ORANGE);
  doc.rect(0, 56, 210, 2, 'F');
  setFill(doc, NAVY);
  doc.rect(0, 58, 210, 2, 'F');

  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(documentTitle.toUpperCase(), 197, 57.2, { align: 'right' });

  setText(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(subtitle.toUpperCase(), 12, 66);
}

function sectionTitle(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
  accent: Rgb = BLUE,
) {
  setFill(doc, accent);
  doc.roundedRect(x, y, 5, 12, 1.5, 1.5, 'F');

  setText(doc, NAVY);
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
  accent: Rgb,
  fill: Rgb,
) {
  setFill(doc, fill);
  setDraw(doc, LINE);
  doc.roundedRect(x, y, w, h, 4, 4, 'FD');

  setFill(doc, accent);
  doc.roundedRect(x + 4, y + 5, 8, 8, 2, 2, 'F');

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(title, x + 16, y + 10.5);
}

function metaCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  setFill(doc, [246, 250, 255]);
  setDraw(doc, LINE);
  doc.roundedRect(x, y, w, 18, 3.5, 3.5, 'FD');

  setText(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text(label.toUpperCase(), x + 5, y + 6.5);

  setText(doc, INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(textOrDash(value), x + 5, y + 13.5);
}

function footer(doc: jsPDF) {
  setFill(doc, NAVY);
  doc.rect(0, 284, 210, 13, 'F');
  setFill(doc, ORANGE);
  doc.rect(0, 284, 210, 1.5, 'F');

  setText(doc, WHITE);
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

  setText(doc, INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(textOrDash(name), x + 6, y + 22);

  setText(doc, MUTED);
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
  infoCard(doc, x, y, w, h, 'Travel Details', BLUE, PALE_BLUE);

  const firstDate = items.find((item) => item.travel_date)?.travel_date;
  const uniqueServices: string[] = [];

  items.forEach((item) => {
    const name = item.service_type?.trim();
    if (name && !uniqueServices.includes(name)) uniqueServices.push(name);
  });

  const services = uniqueServices.join('  •  ') || 'Travel Service';

  const details: Array<[string, string]> = [
    ['Travel Date', firstDate ? dateText(firstDate) : '—'],
    ['Passengers', String(items.length)],
    ['Services', services],
  ];

  details.forEach(([label, value], index) => {
    const yy = y + 22 + index * 9;
    setText(doc, MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.text(label, x + 6, yy);

    setText(doc, INK);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, w - 42);
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
  setFill(doc, [248, 250, 252]);
  setDraw(doc, LINE);
  doc.roundedRect(x, y, w, 42, 4, 4, 'FD');

  sectionTitle(doc, x + 5, y + 4, 'Payment Summary');

  const labels = ['Previous Due', "Today's Bill", 'Paid Now'];
  const values = [previousDue, subtotal, paidNow];

  for (let i = 0; i < labels.length; i += 1) {
    const yy = y + 20 + i * 6.8;
    setText(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(labels[i], x + 7, yy);

    if (i === 2) setText(doc, GREEN);
    else setText(doc, INK);

    doc.setFont('helvetica', 'bold');
    doc.text(money(values[i]), x + w - 7, yy, { align: 'right' });
  }

  setFill(doc, ORANGE);
  doc.roundedRect(x + 5, y + 42, w - 10, 16, 4, 4, 'F');
  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.text('TOTAL OUTSTANDING', x + 11, y + 52);

  doc.setFontSize(11);
  doc.text(money(totalDue), x + w - 11, y + 52, { align: 'right' });
}

function drawBillTableHeader(doc: jsPDF, y: number) {
  setFill(doc, NAVY);
  doc.roundedRect(15, y, 180, 11, 2.5, 2.5, 'F');

  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.7);
  doc.text('#', 19, y + 7);
  doc.text('PASSENGER', 27, y + 7);
  doc.text('TRAVEL DATE', 62, y + 7);
  doc.text('SERVICE / DETAILS', 91, y + 7);
  doc.text('AMOUNT (BDT)', 188, y + 7, { align: 'right' });
}

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());

  drawHeader(doc, logo, 'Booking Bill', 'Booking document / invoice');

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('BOOKING BILL', 15, 78);

  setText(doc, ORANGE);
  doc.setFontSize(13);
  doc.text('INVOICE', 15, 85);

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

  metaCard(doc, 130, 68, 65, 'Bill Number', data.billNo);
  metaCard(doc, 130, 89, 65, 'Bill Date', dateText(data.billDate));

  travelCard(doc, 15, 118, 180, 44, data.items);

  drawBillTableHeader(doc, 168);

  let y = 185;

  for (let index = 0; index < data.items.length; index += 1) {
    const item = data.items[index];
    const detail = [item.service_type || 'Travel Service', item.details]
      .filter(Boolean)
      .join('  •  ');
    const detailLines = doc.splitTextToSize(detail, 73);
    const rowH = Math.max(13, detailLines.length * 4 + 7);

    if (y + rowH > 245) {
      doc.addPage();
      drawHeader(doc, logo, 'Booking Bill', 'Booking document / invoice');
      setText(doc, NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('BOOKING BILL — CONTINUED', 15, 75);
      drawBillTableHeader(doc, 82);
      y = 99;
    }

    const fill = index % 2 === 0 ? [249, 251, 253] : [244, 248, 252];
    setFill(doc, fill as Rgb);
    setDraw(doc, LINE);
    doc.roundedRect(15, y - 6, 180, rowH, 2.5, 2.5, 'FD');

    setText(doc, MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(String(index + 1), 19, y + 1);

    setText(doc, INK);
    doc.setFontSize(7.2);
    doc.text(textOrDash(item.passenger_name), 27, y + 1);

    doc.setFont('helvetica', 'normal');
    setText(doc, MUTED);
    doc.text(item.travel_date ? dateText(item.travel_date) : '—', 62, y + 1);

    setText(doc, INK);
    doc.text(detailLines, 91, y + 1);

    doc.setFont('helvetica', 'bold');
    doc.text(money(item.amount), 188, y + 1, { align: 'right' });

    y += rowH + 2;
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

  const noteX = 116;
  setFill(doc, PALE_ORANGE);
  setDraw(doc, [255, 221, 180]);
  doc.roundedRect(noteX, summaryY, 79, 58, 4, 4, 'FD');

  sectionTitle(doc, noteX + 5, summaryY + 4, 'Important Note', ORANGE);

  setText(doc, MUTED);
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

  for (let i = 0; i < noteLines.length; i += 1) {
    const yy = summaryY + 20 + i * 6.4;
    if (i === 0) setText(doc, ORANGE);
    else setText(doc, MUTED);

    doc.text('•  ' + noteLines[i], noteX + 7, yy);
  }

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Thank You', 188, summaryY + 50, { align: 'right' });

  setText(doc, ORANGE);
  doc.setFontSize(5.8);
  doc.text('For choosing Bangladesh Tours & Travels', 188, summaryY + 56, { align: 'right' });

  footer(doc);
  return doc;
}

export async function buildPaymentPdf(data: PaymentPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());

  drawHeader(doc, logo, 'Payment Receipt', 'Official receipt / payment confirmation');

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text('PAYMENT RECEIPT', 15, 78);

  setText(doc, ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('O F F I C I A L   R E C E I P T', 15, 85);

  customerCard(doc, 15, 92, 106, 52, data.customerName, data.customerPhone);

  metaCard(doc, 130, 68, 65, 'Receipt Number', data.paymentNo);
  metaCard(doc, 130, 89, 65, 'Payment Date', dateText(data.paymentDate));
  metaCard(doc, 130, 110, 65, 'Payment Method', data.method || 'Cash');

  infoCard(doc, 126, 137, 69, 34, 'Payment Reference', BLUE, PALE_BLUE);
  setText(doc, INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Bill Book Payment', 132, 158);

  // Green payment received panel
  setFill(doc, PALE_GREEN);
  setDraw(doc, [186, 232, 210]);
  doc.roundedRect(15, 150, 106, 66, 6, 6, 'FD');

  setFill(doc, GREEN);
  doc.roundedRect(22, 158, 10, 10, 2.5, 2.5, 'F');
  setDraw(doc, WHITE);
  doc.setLineWidth(1.2);
  doc.line(25, 163, 27.4, 165.4);
  doc.line(27.4, 165.4, 31, 161.1);

  setText(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PAYMENT RECEIVED', 38, 165);

  setText(doc, [10, 103, 64]);
  doc.setFontSize(20);
  doc.text(money(data.amount), 22, 187);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Payment successfully recorded', 22, 198);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.text('Thank you for your payment.', 22, 208);

  // Account summary
  setFill(doc, [250, 250, 251]);
  setDraw(doc, LINE);
  doc.roundedRect(126, 176, 69, 73, 5, 5, 'FD');

  sectionTitle(doc, 132, 182, 'Account Summary');

  const dueRows: Array<[string, string, Rgb]> = [
    ['Previous Due', money(data.previousDue), MUTED],
    ['Payment Received', '− ' + money(data.amount), GREEN],
    ['Remaining Due', money(data.remainingDue), INK],
  ];

  dueRows.forEach(([label, value, color], index) => {
    const yy = 202 + index * 12;

    setText(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(label, 132, yy);

    setText(doc, color);
    doc.setFont('helvetica', 'bold');
    doc.text(value, 189, yy, { align: 'right' });

    if (index < dueRows.length - 1) {
      setDraw(doc, LINE);
      doc.line(132, yy + 4, 189, yy + 4);
    }
  });

  setFill(doc, [255, 235, 232]);
  doc.roundedRect(130, 234, 61, 11, 3, 3, 'F');
  setText(doc, RED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.7);
  doc.text('REMAINING DUE', 135, 241);
  doc.setFontSize(8.8);
  doc.text(money(data.remainingDue), 188, 241, { align: 'right' });

  const note = data.note?.trim() || 'This receipt confirms the payment recorded in the Bill Book.';

  setFill(doc, PALE_BLUE);
  setDraw(doc, [210, 228, 245]);
  doc.roundedRect(15, 224, 106, 38, 5, 5, 'FD');

  sectionTitle(doc, 21, 229, 'Payment Note');
  setText(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.text(doc.splitTextToSize(note, 92), 21, 245);

  setText(doc, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Thank You', 118, 270, { align: 'right' });

  setText(doc, ORANGE);
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
