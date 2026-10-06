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

const BLUE = [20, 135, 201] as const;
const ORANGE = [247, 148, 29] as const;
const INK = [15, 23, 42] as const;
const MUTED = [100, 116, 139] as const;
const LIGHT = [241, 245, 249] as const;

function money(value: number) {
  return 'BDT ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function dateText(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function logoDataUrl(customUrl?: string | null) {
  try {
    const sourceUrl = customUrl || '/logo.svg';
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Logo fetch failed');
    const svg = sourceUrl.endsWith('.svg') ? await response.text() : null;
    const blob = svg ? new Blob([svg], { type: 'image/svg+xml' }) : await response.blob();
    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Logo load failed'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 380;
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

function header(doc: jsPDF, logo: string | null, title: string) {
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, 210, 5, 'F');
  if (logo) doc.addImage(logo, 'PNG', 15, 12, 72, 31);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bangladesh Tours & Travels', 195, 21, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Professional Travel Services & Billing', 195, 28, { align: 'right' });
  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), 195, 38, { align: 'right' });
  doc.setDrawColor(...LIGHT);
  doc.line(15, 48, 195, 48);
}

function customerBlock(doc: jsPDF, y: number, name: string, phone?: string | null, address?: string | null) {
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, 180, 31, 4, 4, 'F');
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER', 22, y + 9);
  doc.setTextColor(...INK);
  doc.setFontSize(12);
  doc.text(name || 'Customer', 22, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (phone) doc.text('Mobile: ' + phone, 105, y + 10);
  if (address) doc.text(doc.splitTextToSize(address, 85), 105, y + 20);
}

async function businessLogoUrl() { const { data } = await supabase.from('business_settings').select('logo_url').maybeSingle(); return data?.logo_url || null; }

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());
  header(doc, logo, 'Booking Bill');
  customerBlock(doc, 56, data.customerName, data.customerPhone, data.customerAddress);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('BILL NO.', 15, 96);
  doc.text('BILL DATE', 75, 96);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.text(data.billNo, 15, 103);
  doc.text(dateText(data.billDate), 75, 103);

  let y = 114;
  doc.setFillColor(...BLUE);
  doc.roundedRect(15, y, 180, 10, 2, 2, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('PASSENGER', 20, y + 6.5);
  doc.text('DATE', 78, y + 6.5);
  doc.text('SERVICE / DETAILS', 111, y + 6.5);
  doc.text('AMOUNT', 190, y + 6.5, { align:'right' });
  y += 15;

  doc.setFont('helvetica','normal');
  doc.setTextColor(...INK);
  doc.setFontSize(8.5);

  for (const item of data.items) {
    const detail = [item.service_type || 'Travel Service', item.details].filter(Boolean).join(' · ');
    const detailLines = doc.splitTextToSize(detail, 66);
    const rowH = Math.max(12, detailLines.length * 4.2 + 6);
    if (y + rowH > 255) {
      doc.addPage();
      header(doc, logo, 'Booking Bill');
      y = 58;
    }
    if (Math.round(y / 2) % 2 === 0) {
      doc.setFillColor(248,250,252);
      doc.rect(15,y-5,180,rowH,'F');
    }
    doc.text(item.passenger_name || 'Passenger', 20, y + 1);
    doc.text(item.travel_date ? dateText(item.travel_date) : '—', 78, y + 1);
    doc.text(detailLines, 111, y + 1);
    doc.setFont('helvetica','bold');
    doc.text(money(item.amount), 190, y + 1, { align:'right' });
    doc.setFont('helvetica','normal');
    y += rowH;
  }

  y = Math.max(y + 8, 190);
  doc.setDrawColor(...LIGHT);
  doc.line(105, y, 195, y);
  const rows = [
    ['Previous Due', data.previousDue],
    ["Today's Bill", data.subtotal],
    ['Paid Now', data.paidNow],
  ];
  doc.setFontSize(9);
  rows.forEach(([label,value],i)=>{
    doc.setTextColor(...MUTED);
    doc.text(String(label), 112, y + 9 + i*8);
    doc.setTextColor(...INK);
    doc.text(money(Number(value)), 190, y + 9 + i*8, {align:'right'});
  });
  doc.setFillColor(...ORANGE);
  doc.roundedRect(105, y + 35, 90, 16, 3, 3, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.text('TOTAL DUE', 112, y + 45);
  doc.text(money(data.totalDue), 190, y + 45, {align:'right'});

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.text('Thank you for choosing Bangladesh Tours & Travels.', 105, 278, {align:'center'});
  doc.setDrawColor(...BLUE);
  doc.line(15, 284, 195, 284);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica','bold');
  doc.text('Bangladesh Tours & Travels', 105, 291, {align:'center'});
  return doc;
}

export async function buildPaymentPdf(data: PaymentPdfData) {
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const logo = await logoDataUrl(await businessLogoUrl());
  header(doc, logo, 'Payment Receipt');
  customerBlock(doc, 56, data.customerName, data.customerPhone);

  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('RECEIPT NO.', 15, 96);
  doc.text('PAYMENT DATE', 80, 96);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.text(data.paymentNo, 15, 103);
  doc.text(dateText(data.paymentDate), 80, 103);

  doc.setFillColor(248,250,252);
  doc.roundedRect(15, 118, 180, 74, 5, 5, 'F');
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text('AMOUNT RECEIVED', 25, 132);
  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(26);
  doc.text(money(data.amount), 25, 148);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text('Payment Method', 25, 164);
  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.text(data.method || 'Cash', 25, 172);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.text('Previous Due', 115, 164);
  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.text(money(data.previousDue), 190, 164, {align:'right'});
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.text('Remaining Due', 115, 176);
  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica','bold');
  doc.text(money(data.remainingDue), 190, 176, {align:'right'});

  if (data.note) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text('Note', 15, 213);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(data.note, 175), 15, 221);
  }

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.text('This receipt confirms the payment recorded in the Bill Book.', 105, 278, {align:'center'});
  doc.setDrawColor(...BLUE);
  doc.line(15, 284, 195, 284);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica','bold');
  doc.text('Bangladesh Tours & Travels', 105, 291, {align:'center'});
  return doc;
}

export async function sharePdf(doc: jsPDF, fileName: string, whatsappText: string) {
  const blob = doc.output('blob');
  const file = new File([blob], fileName, {type:'application/pdf'});
  if (navigator.share && navigator.canShare?.({files:[file]})) {
    await navigator.share({files:[file], text: whatsappText, title:fileName});
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  window.open('https://wa.me/?text=' + encodeURIComponent(whatsappText), '_blank', 'noopener,noreferrer');
}
