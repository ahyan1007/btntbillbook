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

type PdfBranding = {
  company_name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footer_text: string;
  pdf_template: 'travel' | 'classic' | 'modern' | 'minimal';
  logo_url?: string | null;
  show_logo: boolean;
  primary_color: string;
  accent_color: string;
};

const DEFAULT_BRANDING: PdfBranding = {
  company_name: 'Bangladesh Tours & Travels',
  tagline: 'Your Trusted Travel Partner',
  address: '',
  phone: '',
  email: '',
  website: '',
  footer_text: 'Professional Travel Services',
  pdf_template: 'travel',
  show_logo: true,
  primary_color: '#0f172a',
  accent_color: '#f7941d',
};

const BLUE = [20, 135, 201] as const;
const ORANGE = [247, 148, 29] as const;
const INK = [15, 23, 42] as const;
const MUTED = [100, 116, 139] as const;
const LIGHT = [241, 245, 249] as const;

function money(value: number) {
  return '₹ ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function dateText(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function businessBranding(): Promise<PdfBranding> {
  try {
    const { data } = await supabase.from('business_settings').select(
      'logo_url,company_name,tagline,address,phone,email,website,footer_text,pdf_template,show_logo,primary_color,accent_color'
    ).maybeSingle();

    if (!data) return DEFAULT_BRANDING;

    return {
      company_name: data.company_name || DEFAULT_BRANDING.company_name,
      tagline: data.tagline || DEFAULT_BRANDING.tagline,
      address: data.address || '',
      phone: data.phone || '',
      email: data.email || '',
      website: data.website || '',
      footer_text: data.footer_text || DEFAULT_BRANDING.footer_text,
      pdf_template: (data.pdf_template || DEFAULT_BRANDING.pdf_template) as PdfBranding['pdf_template'],
      logo_url: data.logo_url || null,
      show_logo: data.show_logo !== false,
      primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
      accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
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
    // Keep the embedded logo compact: a 600 × 250 JPEG is more than enough
    // for an A4 invoice and is far smaller than the previous 900 × 380 PNG.
    canvas.width = 600;
    canvas.height = 250;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sourceWidth = image.naturalWidth || image.width || canvas.width;
    const sourceHeight = image.naturalHeight || image.height || canvas.height;
    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      (canvas.width - drawWidth) / 2,
      (canvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    URL.revokeObjectURL(url);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function hexRgb(value: string, fallback: readonly [number,number,number]) {
  const hex=value.trim().replace(/^#/,'');
  if(!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)] as const;
}

function header(doc: jsPDF, logo: string | null, title: string, brand: PdfBranding) {
  const primary = hexRgb(brand.primary_color, INK);
  const accent = hexRgb(brand.accent_color, ORANGE);

  if (brand.pdf_template === 'minimal') {
    doc.setFillColor(255,255,255);
    doc.rect(0,0,210,37,'F');
    if (logo && brand.show_logo) doc.addImage(logo,'JPEG',12,7,52,20);
    doc.setTextColor(...primary as [number,number,number]);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.text(brand.company_name,196,15,{align:'right'});
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.8);
    doc.text(title.toUpperCase(),196,22,{align:'right'});
    doc.setFillColor(...accent);
    doc.rect(0,35,210,2,'F');
    return;
  }

  if (brand.pdf_template === 'classic') {
    doc.setFillColor(...INK);
    doc.rect(0,0,210,45,'F');
    doc.setFillColor(...accent);
    doc.rect(0,0,210,3,'F');
    if (logo && brand.show_logo) doc.addImage(logo,'JPEG',12,8,62,25);
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text(brand.company_name,195,16,{align:'right'});
    doc.setTextColor(203,213,225);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.text((brand.tagline||'').toUpperCase(),195,23,{align:'right'});
    doc.setTextColor(...accent);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text(title.toUpperCase(),195,35,{align:'right'});
    return;
  }

  if (brand.pdf_template === 'modern') {
    doc.setFillColor(247,250,254);
    doc.rect(0,0,210,49,'F');
    if (logo && brand.show_logo) doc.addImage(logo,'JPEG',12,8,58,22);
    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text(brand.company_name,195,15,{align:'right'});
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.8);
    doc.text(brand.tagline || '',195,22,{align:'right'});
    doc.setTextColor(...accent);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.text(title.toUpperCase(),195,32,{align:'right'});
    doc.setFillColor(...accent);
    doc.rect(0,47,210,2,'F');
    return;
  }

  // Travel Premium — clean, contemporary layout with a compact accent panel.
  doc.setFillColor(255,255,255);
  doc.rect(0,0,210,49,'F');
  doc.setFillColor(...primary);
  doc.rect(136,0,74,49,'F');
  doc.setFillColor(...accent);
  doc.rect(0,0,210,2,'F');

  if (logo && brand.show_logo) doc.addImage(logo,'JPEG',12,7,54,23);

  doc.setTextColor(...primary);
  doc.setFont('helvetica','bold');
  doc.setFontSize(13.5);
  const companyLines = doc.splitTextToSize(brand.company_name || DEFAULT_BRANDING.company_name, 118);
  doc.text(companyLines.slice(0,1),12,35);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  const taglineLines = doc.splitTextToSize(brand.tagline || 'Your Trusted Travel Partner', 118);
  doc.text(taglineLines.slice(0,1),12,42);

  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  const titleLines = doc.splitTextToSize(title.toUpperCase(), 60);
  doc.text(titleLines.slice(0,2),198,17,{align:'right'});
  doc.setTextColor(226,232,240);
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.2);
  doc.text('FLIGHTS  •  TOURS  •  VISA  •  HOTELS',198,31,{align:'right'});
  doc.setFillColor(...accent);
  doc.rect(0,47,210,2,'F');
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
  doc.setFontSize(11.5);
  doc.text(name || 'Customer', 21, y+21);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7.2);
  if (phone) doc.text(phone, 21, y+29);

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


function brandingFooter(doc: jsPDF, brand: PdfBranding) {
  const primary = hexRgb(brand.primary_color, INK);
  const accent = hexRgb(brand.accent_color, ORANGE);
  doc.setFillColor(...primary);
  doc.rect(0,284,210,13,'F');
  doc.setFillColor(...accent);
  doc.rect(0,284,210,1.5,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text([brand.company_name,brand.footer_text].filter(Boolean).join('  •  '),12,292.5);
  const contact=[brand.address,brand.phone,brand.email,brand.website].filter(Boolean).join('  •  ');
  if(contact){
    doc.setFont('helvetica','normal');
    doc.setFontSize(5.5);
    doc.text(contact,198,288.5,{align:'right',maxWidth:86});
  }
  doc.setFont('helvetica','normal');
  doc.setFontSize(6);
  doc.text('Computer generated document',198,292.5,{align:'right'});
}



function drawBillTableHeader(doc: jsPDF, y: number) {
  doc.setFillColor(...INK);
  doc.roundedRect(15,y,180,11,2,2,'F');
  doc.setFillColor(...ORANGE);
  doc.roundedRect(15,y,3,11,1.5,1.5,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.7);
  doc.text('#',20,y+7);
  doc.text('PASSENGER',28,y+7);
  doc.text('TRAVEL DATE',65,y+7);
  doc.text('SERVICE / DETAILS',97,y+7);
  doc.text('AMOUNT (₹)',190,y+7,{align:'right'});
  return y+16;
}

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true,precision:2});
  const brand = await businessBranding();
  const logo = brand.show_logo ? await logoDataUrl(brand.logo_url) : null;

  header(doc,logo,'Booking Bill',brand);
  customerBlock(doc,53,data.customerName,data.customerPhone,data.customerAddress);
  pill(doc,15,94,54,'Bill Number',data.billNo);
  pill(doc,73,94,54,'Bill Date',dateText(data.billDate));
  pill(doc,131,94,64,'Document','Booking Bill');

  let y=117;
  y=drawBillTableHeader(doc,y);

  doc.setFontSize(8);
  let itemIndex = 0;
  for(const item of data.items){
    const detail=[item.service_type||'Travel Service',item.details].filter(Boolean).join('  ·  ');
    const lines=doc.splitTextToSize(detail,66);
    const passengerLines=doc.splitTextToSize(item.passenger_name||'Passenger',32);
    const rowH=Math.max(10.5,Math.max(lines.length,passengerLines.length)*3.2+4.5);
    if(y+rowH>222){
      doc.addPage();
      header(doc,logo,'Booking Bill',brand);
      y=58;
      y=drawBillTableHeader(doc,y);
    }
    const rowFill = itemIndex % 2 === 0 ? [249,251,253] : [244,248,252];
    doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(15,y-5,180,rowH,2,2,'FD');

    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.8);
    doc.text(String(itemIndex + 1),20,y+1);

    doc.setTextColor(...INK);
    doc.setFontSize(7.2);
    doc.text(passengerLines.slice(0,2),28,y+1);

    doc.setFont('helvetica','normal');
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.text(item.travel_date?dateText(item.travel_date):'—',65,y+1);

    doc.setTextColor(...INK);
    doc.text(lines.slice(0,3),97,y+1);

    doc.setFont('helvetica','bold');
    doc.setFontSize(7.2);
    doc.text(money(item.amount),190,y+1,{align:'right'});
    y+=rowH+1.2;
    itemIndex += 1;
  }

  // Put the financial summary on a fresh page when a long bill would
  // otherwise collide with the footer or the summary card.
  if(y>210){
    doc.addPage();
    header(doc,logo,'Booking Bill',brand);
    y=58;
  }
  y=Math.max(y+4,166);

  // Right-side premium payment summary.
  doc.setFillColor(248,250,253);
  doc.setDrawColor(220,231,242);
  doc.roundedRect(105,y,90,58,4.5,4.5,'FD');

  doc.setFillColor(...BLUE);
  doc.roundedRect(110,y+5,5,10,1.5,1.5,'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8.2);
  doc.text('PAYMENT SUMMARY',120,y+12);

  const rows=[['Previous Due',data.previousDue],["Today's Bill",data.subtotal],['Paid Now',data.paidNow]];
  rows.forEach(([label,value],i)=>{
    const yy=y+22+i*7.5;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.2);
    doc.text(String(label),112,yy);
    if(i===2) doc.setTextColor(16,160,100);
    else doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.text(money(Number(value)),190,yy,{align:'right'});
  });

  // Highlighted outstanding amount.
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
  doc.text('Thank you for choosing ' + brand.company_name + '.',105,278,{align:'center'});
  // Add a consistent footer to every page, not just the last one.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    brandingFooter(doc,brand);
  }
  return doc;
}


export async function buildPaymentPdf(data: PaymentPdfData) {
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true,precision:2});
  const brand = await businessBranding();
  const logo = brand.show_logo ? await logoDataUrl(brand.logo_url) : null;

  header(doc,logo,'Payment Receipt',brand);
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
  brandingFooter(doc,brand);
  return doc;
}


export async function sharePdf(doc: jsPDF, fileName: string, whatsappText: string) {
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });

  // On supported phones/tablets, use the native OS share sheet.
  // This lets the user choose WhatsApp and then select the recipient,
  // while keeping the PDF attached to the share payload.
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const shareData = {
        files: [file],
        title: fileName,
        text: whatsappText,
      };

      if (navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      // User cancellation is normal; do not open another window or download.
      if (error instanceof DOMException && error.name === 'AbortError') return;

      // For a browser that rejects native file sharing, continue to the
      // desktop/manual fallback below.
    }
  }

  // Desktop / unsupported-browser fallback:
  // A browser cannot programmatically attach a local PDF to an arbitrary
  // WhatsApp Web chat, so we open WhatsApp Web and download the PDF.
  const waWindow = window.open('https://web.whatsapp.com/', '_blank');
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
