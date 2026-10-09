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
  description?: string | null;
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
  doc.roundedRect(15,y,180,10.5,2.2,2.2,'F');
  doc.setFillColor(...ORANGE);
  doc.roundedRect(15,y,2.5,10.5,1.2,1.2,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.2);
  doc.text('#',20,y+6.9);
  doc.text('PASSENGER',29,y+6.9);
  doc.text('SERVICE / DETAILS',68,y+6.9);
  doc.text('TRAVEL DATE',130,y+6.9);
  doc.text('AMOUNT',190,y+6.9,{align:'right'});
  return y+10.5;
}

export async function buildBillPdf(data: BillPdfData) {
  const doc = new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true,precision:2});
  const brand = await businessBranding();
  const logo = brand.show_logo ? await logoDataUrl(brand.logo_url) : null;
  const primary = hexRgb(brand.primary_color, INK);
  const accent = hexRgb(brand.accent_color, ORANGE);
  const rightEdge = 195;

  function drawBrandBanner() {
    // Use the same template-aware renderer as payment receipts so the
    // Dashboard's Travel / Classic / Modern / Minimal setting applies to bills too.
    header(doc, logo, 'Booking Bill', brand);
  }

  function drawCustomerAndBillInfo() {
    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.1);
    doc.text('INVOICE FOR TRAVEL SERVICES',15,54);
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.3);
    doc.text('CUSTOMER COPY',195,54,{align:'right'});

    doc.setFillColor(246,249,252);
    doc.setDrawColor(218,228,238);
    doc.roundedRect(15,60,180,36,4,4,'FD');
    doc.setDrawColor(218,228,238);
    doc.line(110,66,110,90);

    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.1);
    doc.text('BILL TO',22,69);
    doc.setTextColor(...INK);
    doc.setFontSize(10.3);
    const customerName = doc.splitTextToSize(data.customerName || 'Customer', 81);
    doc.text(customerName.slice(0,1),22,78);
    doc.setFontSize(7);
    doc.setFont('helvetica','normal');
    const contact = [data.customerPhone, data.customerAddress].filter(Boolean).join('  •  ');
    const contactLines = doc.splitTextToSize(contact || 'Contact details not provided', 82);
    doc.setTextColor(...MUTED);
    doc.text(contactLines.slice(0,2),22,85);

    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.1);
    doc.text('BILL NUMBER',118,69);
    doc.setTextColor(...INK);
    doc.setFontSize(8.2);
    doc.text(doc.splitTextToSize(data.billNo || '—', 69).slice(0,1),118,77.5);
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.1);
    doc.text('BILL DATE',118,85.5);
    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.text(dateText(data.billDate),118,92);
  }

  function drawTableHeaderAt(y: number) {
    doc.setFillColor(...INK);
    doc.roundedRect(15,y,180,10.5,2.2,2.2,'F');
    doc.setFillColor(...accent);
    doc.roundedRect(15,y,2.5,10.5,1.2,1.2,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.2);
    doc.text('#',20,y+6.9);
    doc.text('PASSENGER',29,y+6.9);
    doc.text('SERVICE / DETAILS',68,y+6.9);
    doc.text('TRAVEL DATE',130,y+6.9);
    doc.text('AMOUNT',190,y+6.9,{align:'right'});
    return y+10.5;
  }

  function drawFirstPage() {
    drawBrandBanner();
    drawCustomerAndBillInfo();

    let servicesHeadingY = 109;
    const description = (data.description || '').trim();
    if (description) {
      const lines = doc.splitTextToSize(description, 168).slice(0, 4);
      const boxY = 100;
      const boxH = 12 + lines.length * 3.5;
      doc.setFillColor(238,246,252);
      doc.setDrawColor(218,232,242);
      doc.roundedRect(15,boxY,180,boxH,2.5,2.5,'FD');
      doc.setTextColor(...primary);
      doc.setFont('helvetica','bold');
      doc.setFontSize(6.1);
      doc.text('DESCRIPTION',22,boxY+4.7);
      doc.setTextColor(...INK);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.1);
      doc.text(lines,22,boxY+10);
      servicesHeadingY = boxY + boxH + 8;
    }

    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10.3);
    doc.text('SERVICE DETAILS',15,servicesHeadingY);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.8);
    doc.text(String(data.items.length) + (data.items.length === 1 ? ' service' : ' services'),195,servicesHeadingY,{align:'right'});
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.45);
    doc.line(15,servicesHeadingY+3,195,servicesHeadingY+3);
    return drawTableHeaderAt(servicesHeadingY+7);
  }

  function drawContinuationPage() {
    drawBrandBanner();
    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.4);
    doc.text('BILL ' + (data.billNo || ''),15,55);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.1);
    doc.text('Customer: ' + (data.customerName || 'Customer'),195,55,{align:'right',maxWidth:130});
    return drawTableHeaderAt(63);
  }

  let y = drawFirstPage();
  let itemIndex = 0;
  for (const item of data.items) {
    const passengerLines = doc.splitTextToSize(item.passenger_name || 'Passenger', 35).slice(0,2);
    const serviceName = (item.service_type || 'Travel Service').trim();
    const detailLines = item.details
      ? doc.splitTextToSize(item.details.trim(), 54).slice(0,2)
      : [];
    const rowH = Math.max(15, passengerLines.length > 1 ? 18 : 15, detailLines.length > 1 ? 18 : 15);

    if (y + rowH > 270) {
      doc.addPage();
      y = drawContinuationPage();
    }

    if (itemIndex % 2 === 1) {
      doc.setFillColor(246,249,252);
      doc.roundedRect(15,y,180,rowH,2,2,'F');
    }
    doc.setDrawColor(222,230,238);
    doc.setLineWidth(0.25);
    doc.line(17,y+rowH,193,y+rowH);

    doc.setTextColor(...BLUE);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.6);
    doc.text(String(itemIndex+1),20,y+6.9);

    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.4);
    doc.text(passengerLines,29,y+6.6);

    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.1);
    doc.text(doc.splitTextToSize(serviceName,54).slice(0,1),68,y+5.9);
    if (detailLines.length) {
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.2);
      doc.text(detailLines,68,y+10.7);
    }

    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.5);
    doc.text(item.travel_date ? dateText(item.travel_date) : '—',130,y+7,{maxWidth:28});

    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.text(money(item.amount),190,y+7,{align:'right'});

    y += rowH;
    itemIndex += 1;
  }

  if (data.items.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text('No service items were recorded for this bill.',20,y+10);
    y += 18;
  }

  function drawFinancialSummary(startY: number) {
    doc.setFillColor(238,246,252);
    doc.setDrawColor(220,232,242);
    doc.roundedRect(15,startY,180,13,3,3,'FD');
    doc.setTextColor(...BLUE);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.8);
    doc.text("TODAY'S BILL TOTAL",23,startY+8.2);
    doc.setTextColor(...primary);
    doc.setFontSize(11.5);
    doc.text(money(data.subtotal),190,startY+8.9,{align:'right'});

    const headingY = startY+24;
    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text('PAYMENT SUMMARY',15,headingY);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.7);
    doc.text('All amounts in INR',195,headingY,{align:'right'});

    const panelY = startY+30;
    doc.setFillColor(255,255,255);
    doc.setDrawColor(218,228,238);
    doc.roundedRect(15,panelY,99,49,3.5,3.5,'FD');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.2);
    doc.text('BILL BREAKDOWN',22,panelY+8.5);

    const summaryRows: Array<[string,number,readonly [number,number,number],string]> = [
      ['Previous balance due',Number(data.previousDue||0),INK,''],
      ["Today's bill",Number(data.subtotal||0),INK,'+ '],
      ['Payment received today',Number(data.paidNow||0),[16,145,82] as const,'− '],
    ];
    summaryRows.forEach((row,index) => {
      const rowY = panelY+18+index*9.5;
      doc.setTextColor(...(row[2] as [number,number,number]));
      doc.setFont('helvetica',index===2?'bold':'normal');
      doc.setFontSize(6.8);
      doc.text(row[0],22,rowY);
      doc.setFont('helvetica','bold');
      doc.setFontSize(7.1);
      doc.text(row[3]+money(row[1]),107,rowY,{align:'right'});
    });

    const dueX = 119;
    doc.setFillColor(...primary);
    doc.roundedRect(dueX,panelY,76,49,3.5,3.5,'F');
    doc.setTextColor(222,234,243);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.2);
    doc.text(Number(data.totalDue||0) <= 0 ? 'BALANCE SETTLED' : 'TOTAL BALANCE DUE',dueX+7,panelY+10);
    doc.setTextColor(220,232,244);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.1);
    doc.text(Number(data.totalDue||0) <= 0 ? 'No amount remaining' : 'Amount remaining to pay',dueX+7,panelY+19);
    doc.setTextColor(...accent);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13.5);
    doc.text(money(data.totalDue),dueX+7,panelY+34,{maxWidth:64});
    doc.setFillColor(255,255,255);
    doc.roundedRect(dueX+7,panelY+38,56,7,2,2,'F');
    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(5.7);
    doc.text(Number(data.totalDue||0) <= 0 ? 'PAID IN FULL' : 'BALANCE DUE',dueX+35,panelY+43,{align:'center'});
    return panelY+49;
  }

  let summaryStart = y+3;
  if (summaryStart+96 > 278) {
    doc.addPage();
    drawBrandBanner();
    doc.setTextColor(...primary);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.text('BILL ' + (data.billNo || ''),15,55);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.text('Customer: ' + (data.customerName || 'Customer'),195,55,{align:'right',maxWidth:130});
    summaryStart = 76;
  }

  const summaryEnd = drawFinancialSummary(summaryStart);
  const noteY = summaryEnd+5;
  if (noteY+12 < 282) {
    doc.setFillColor(255,246,235);
    doc.setDrawColor(250,222,190);
    doc.roundedRect(15,noteY,180,12,2.5,2.5,'FD');
    doc.setFillColor(...accent);
    doc.circle(21,noteY+6,1.4,'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.5);
    doc.text('PLEASE CHECK',26,noteY+7.1);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.3);
    doc.text('Passenger names, travel dates and amounts before payment.',67,noteY+7.1);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page=1; page<=pageCount; page+=1) {
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
    doc.text('DESCRIPTION',15,241);
    doc.setTextColor(...INK);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(data.note,180).slice(0,3),15,248);
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
