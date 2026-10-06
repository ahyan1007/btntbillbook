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
  // Premium navy header with orange accent
  doc.setFillColor(...INK);
  doc.rect(0, 0, 210, 42, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, 210, 3, 'F');

  if (logo) doc.addImage(logo, 'PNG', 15, 9, 58, 24);

  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.text('Bangladesh Tours & Travels', 195, 16, {align:'right'});
  doc.setTextColor(203,213,225);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.5);
  doc.text('PROFESSIONAL TRAVEL SERVICES', 195, 23, {align:'right'});
  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.text(title.toUpperCase(), 195, 34, {align:'right'});

  doc.setFillColor(248,250,252);
  doc.rect(0, 42, 210, 3, 'F');
}

function pill(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  doc.setFillColor(248,250,252);
  doc.roundedRect(x,y,w,19,3,3,'F');
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.5);
  doc.text(label.toUpperCase(), x+6, y+7);
  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.5);
  doc.text(value || '—', x+6, y+14);
}

function customerBlock(doc: jsPDF, y: number, name: string, phone?: string | null, address?: string | null) {
  doc.setFillColor(248,250,252);
  doc.setDrawColor(226,232,240);
  doc.roundedRect(15,y,180,35,5,5,'FD');

  doc.setFillColor(...BLUE);
  doc.roundedRect(15,y,4,35,2,2,'F');

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.5);
  doc.text('BILLED TO', 25, y+9);

  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.text(name || 'Customer', 25, y+19);

  doc.setFont('helvetica','normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  if (phone) doc.text('Mobile  ' + phone, 25, y+28);
  if (address) doc.text(doc.splitTextToSize(address, 82), 105, y+12);
}


async function businessLogoUrl() { const { data } = await supabase.from('business_settings').select('logo_url').maybeSingle(); return data?.logo_url || null; }

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const logo = await logoDataUrl(await businessLogoUrl());

  header(doc,logo,'Booking Bill');
  customerBlock(doc,53,data.customerName,data.customerPhone,data.customerAddress);
  pill(doc,15,94,54,'Bill Number',data.billNo);
  pill(doc,73,94,54,'Bill Date',dateText(data.billDate));
  pill(doc,131,94,64,'Document','Booking Bill');

  let y=123;
  doc.setFillColor(...INK);
  doc.roundedRect(15,y,180,11,2,2,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('PASSENGER',20,y+7);
  doc.text('TRAVEL DATE',67,y+7);
  doc.text('SERVICE / DETAILS',105,y+7);
  doc.text('AMOUNT',190,y+7,{align:'right'});
  y+=17;

  doc.setFontSize(8);
  for(const item of data.items){
    const detail=[item.service_type||'Travel Service',item.details].filter(Boolean).join('  ·  ');
    const lines=doc.splitTextToSize(detail,66);
    const rowH=Math.max(14,lines.length*4.1+7);
    if(y+rowH>250){
      doc.addPage();
      header(doc,logo,'Booking Bill');
      y=58;
    }
    doc.setFillColor(248,250,252);
    doc.roundedRect(15,y-6,180,rowH,2,2,'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.text(item.passenger_name||'Passenger',20,y+1);
    doc.setFont('helvetica','normal');
    doc.text(item.travel_date?dateText(item.travel_date):'—',67,y+1);
    doc.text(lines,105,y+1);
    doc.setFont('helvetica','bold');
    doc.text(money(item.amount),190,y+1,{align:'right'});
    y+=rowH+2;
  }

  y=Math.max(y+7,190);
  doc.setDrawColor(226,232,240);
  doc.line(105,y,195,y);

  const rows=[['Previous Due',data.previousDue],["Today's Bill",data.subtotal],['Paid Now',data.paidNow]];
  rows.forEach(([label,value],i)=>{
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(String(label),112,y+9+i*8);
    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.text(money(Number(value)),190,y+9+i*8,{align:'right'});
  });

  doc.setFillColor(...ORANGE);
  doc.roundedRect(105,y+35,90,18,4,4,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('TOTAL OUTSTANDING',112,y+43);
  doc.setFontSize(11);
  doc.text(money(data.totalDue),190,y+44,{align:'right'});

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.text('Thank you for choosing Bangladesh Tours & Travels.',105,278,{align:'center'});
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(.7);
  doc.line(15,284,195,284);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('Bangladesh Tours & Travels  •  Professional Travel Services',105,291,{align:'center'});
  return doc;
}


export async function buildPaymentPdf(data: PaymentPdfData) {
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const logo=await logoDataUrl(await businessLogoUrl());

  header(doc,logo,'Payment Receipt');
  customerBlock(doc,53,data.customerName,data.customerPhone);
  pill(doc,15,94,54,'Receipt Number',data.paymentNo);
  pill(doc,73,94,54,'Payment Date',dateText(data.paymentDate));
  pill(doc,131,94,64,'Payment Method',data.method||'Cash');

  doc.setFillColor(...INK);
  doc.roundedRect(15,122,180,54,6,6,'F');
  doc.setTextColor(203,213,225);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('PAYMENT RECEIVED',25,134);
  doc.setTextColor(255,255,255);
  doc.setFontSize(23);
  doc.text(money(data.amount),25,149);
  doc.setTextColor(...ORANGE);
  doc.setFontSize(8);
  doc.text('PAYMENT CONFIRMED',25,164);

  doc.setFillColor(248,250,252);
  doc.setDrawColor(226,232,240);
  doc.roundedRect(15,184,180,42,5,5,'FD');
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.text('Previous Due',25,197);
  doc.text('Payment Received',25,208);
  doc.text('Remaining Due',25,219);
  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.text(money(data.previousDue),190,197,{align:'right'});
  doc.setTextColor(16,185,129);
  doc.text('− '+money(data.amount),190,208,{align:'right'});
  doc.setTextColor(...ORANGE);
  doc.setFontSize(10);
  doc.text(money(data.remainingDue),190,219,{align:'right'});

  if(data.note){
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7);
    doc.text('NOTE',15,241);
    doc.setTextColor(...INK);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(data.note,180),15,248);
  }

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.text('This receipt confirms the payment recorded in the Bill Book.',105,278,{align:'center'});
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(.7);
  doc.line(15,284,195,284);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('Bangladesh Tours & Travels  •  Professional Travel Services',105,291,{align:'center'});
  return doc;
}


export async function sharePdf(doc: jsPDF, fileName: string, whatsappText: string) {
  const waWindow = window.open('https://web.whatsapp.com/', '_blank');
  const blob = doc.output('blob');
  const file = new File([blob], fileName, {type:'application/pdf'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  try {
    await navigator.clipboard?.writeText(whatsappText);
  } catch {}
  if (!waWindow) {
    window.location.href = 'https://web.whatsapp.com/';
  }
}

export async function sendPdfToWhatsApp(doc: jsPDF, fileName: string, phone?: string | null, message?: string) {
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
    body: { phone, fileName, caption: message || '', pdfBase64 },
  });
  if (error) throw new Error(error.message || 'WhatsApp send failed.');
}
