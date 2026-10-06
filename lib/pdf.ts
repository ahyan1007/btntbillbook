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
  // Premium travel header — kept within the existing stable page layout.
  doc.setFillColor(255,255,255);
  doc.rect(0, 0, 210, 49, 'F');

  // Soft travel illustration panel on the right.
  doc.setFillColor(242,247,253);
  doc.rect(118, 0, 92, 49, 'F');

  // Skyline.
  doc.setFillColor(...INK);
  doc.rect(150, 31, 6, 18, 'F');
  doc.rect(159, 24, 8, 25, 'F');
  doc.rect(170, 28, 6, 21, 'F');
  doc.rect(179, 19, 8, 30, 'F');
  doc.rect(191, 26, 6, 23, 'F');
  doc.rect(201, 33, 4, 16, 'F');

  doc.setFillColor(...ORANGE);
  doc.rect(150, 31, 6, 1.2, 'F');
  doc.rect(159, 24, 8, 1.2, 'F');
  doc.rect(179, 19, 8, 1.2, 'F');

  // Globe.
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.55);
  doc.circle(176, 28, 10, 'S');
  doc.line(166, 28, 186, 28);
  doc.ellipse(176, 28, 4.5, 10, 'S');
  doc.line(168, 23, 184, 23);
  doc.line(168, 33, 184, 33);

  // Flight path + plane motif.
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.55);
  doc.line(121, 16, 139, 12);
  doc.line(139, 12, 150, 15);
  doc.setDrawColor(...INK);
  doc.line(141, 12, 153, 9);
  doc.line(153, 9, 156, 12);
  doc.line(153, 9, 149, 6);
  doc.line(149, 12, 145, 17);

  if (logo) doc.addImage(logo, 'PNG', 12, 7, 72, 23);

  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.text('Bangladesh Tours & Travels', 12, 37);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.2);
  doc.text('Your Trusted Travel Partner', 12, 43);

  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  doc.text('AIR TICKET  •  TOUR PACKAGE  •  VISA  •  HOTEL', 120, 46);

  // Orange + navy divider.
  doc.setFillColor(...ORANGE);
  doc.rect(0, 47, 210, 1, 'F');
  doc.setFillColor(...INK);
  doc.rect(0, 48, 210, 1, 'F');
}

function pill(doc: jsPDF, x: number, y: number, w: number, label: string, value: string) {
  doc.setFillColor(247,250,254);
  doc.setDrawColor(226,234,243);
  doc.roundedRect(x,y,w,19,3.5,3.5,'FD');

  doc.setFillColor(...ORANGE);
  doc.roundedRect(x+5,y+5,3,9,1.2,1.2,'F');

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6);
  doc.text(label.toUpperCase(), x+11, y+7);

  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.3);
  doc.text(value || '—', x+11, y+14);
}

function customerBlock(doc: jsPDF, y: number, name: string, phone?: string | null, address?: string | null) {
  // Billed-to card
  doc.setFillColor(247,250,254);
  doc.setDrawColor(220,231,242);
  doc.roundedRect(15,y,180,35,5,5,'FD');

  doc.setFillColor(...ORANGE);
  doc.roundedRect(19,y+5,8,8,2,2,'F');

  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.4);
  doc.text('BILLED TO', 32, y+11);

  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(12);
  doc.text(name || 'Customer', 21, y+21);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.2);
  if (phone) doc.text(phone, 21, y+29);

  // Address panel inside the same card.
  doc.setFillColor(255,255,255);
  doc.setDrawColor(230,236,243);
  doc.roundedRect(111,y+5,79,25,4,4,'FD');

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.1);
  doc.text('ADDRESS', 117, y+12);

  doc.setTextColor(...INK);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  const addressLines = doc.splitTextToSize(address || '—', 66);
  doc.text(addressLines.slice(0,2), 117, y+19);
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
  doc.roundedRect(15,y,180,11,2.5,2.5,'F');
  doc.setFillColor(...ORANGE);
  doc.roundedRect(15,y,4,11,2.5,2.5,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.8);
  doc.text('#',20,y+7);
  doc.text('PASSENGER',28,y+7);
  doc.text('TRAVEL DATE',65,y+7);
  doc.text('SERVICE / DETAILS',97,y+7);
  doc.text('AMOUNT (BDT)',190,y+7,{align:'right'});
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
    const rowFill = (index % 2 === 0) ? [250,252,255] : [244,248,252];
    doc.setFillColor(rowFill[0],rowFill[1],rowFill[2]);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(15,y-6,180,rowH,2.5,2.5,'FD');

    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.8);
    doc.text(String(index + 1),20,y+1);

    doc.setTextColor(...INK);
    doc.setFontSize(7.5);
    doc.text(item.passenger_name||'Passenger',28,y+1);

    doc.setFont('helvetica','normal');
    doc.setTextColor(...MUTED);
    doc.text(item.travel_date?dateText(item.travel_date):'—',65,y+1);

    doc.setTextColor(...INK);
    doc.text(lines,97,y+1);

    doc.setFont('helvetica','bold');
    doc.text(money(item.amount),190,y+1,{align:'right'});
    y+=rowH+2;
  }

  y=Math.max(y+7,190);

  // Premium payment summary card.
  doc.setFillColor(248,250,253);
  doc.setDrawColor(220,231,242);
  doc.roundedRect(105,y,90,58,4.5,4.5,'FD');

  doc.setTextColor(...BLUE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.2);
  doc.text('PAYMENT SUMMARY',112,y+9);

  const rows=[['Previous Due',data.previousDue],["Today's Bill",data.subtotal],['Paid Now',data.paidNow]];
  rows.forEach(([label,value],i)=>{
    const yy=y+19+i*7.5;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.2);
    doc.text(String(label),112,yy);
    doc.setTextColor(i===2 ? 16 : 15,i===2 ? 160 : 23,i===2 ? 100 : 42);
    doc.setFont('helvetica','bold');
    doc.text(money(Number(value)),190,yy,{align:'right'});
  });

  doc.setFillColor(...ORANGE);
  doc.roundedRect(105,y+42,90,16,4,4,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text('TOTAL OUTSTANDING',112,y+52);
  doc.setFontSize(10.5);
  doc.text(money(data.totalDue),190,y+53,{align:'right'});

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
