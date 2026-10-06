'use client';

import { useState } from 'react';
import { FileDown, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildBillPdf, buildPaymentPdf, sharePdf, type BillPdfData, type PaymentPdfData } from '@/lib/pdf';

async function sendPdfToWhatsApp(doc: any, fileName: string, phone?: string | null, message?: string) {
  if (!phone) throw new Error('Customer phone number is required for WhatsApp sending.');
  const blob = doc.output('blob');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const { error } = await supabase.functions.invoke('send-whatsapp-pdf', {
    body: { phone, fileName, caption: message || '', pdfBase64: btoa(binary) },
  });
  if (error) throw new Error(error.message || 'WhatsApp send failed.');
}

export function BillPdfActions({data}:{data:BillPdfData}) {
  const [busy,setBusy]=useState(false);
  async function run(whatsapp=false, direct=false){
    setBusy(true);
    try {
      const doc=await buildBillPdf(data);
      const fileName=data.billNo+'.pdf';
      const message='Bangladesh Tours & Travels\\nBill '+data.billNo+'\\nCustomer: '+data.customerName+'\\nToday\'s Bill: BDT '+data.subtotal.toLocaleString('en-IN')+'\\nTotal Due: BDT '+data.totalDue.toLocaleString('en-IN')+'\\nPlease find the bill attached.';
      if(direct) await sendPdfToWhatsApp(doc,fileName,data.customerPhone,message); else if(direct) await sendPdfToWhatsApp(doc,fileName,data.customerPhone,message); else if(direct) await sendPdfToWhatsApp(doc,fileName,data.customerPhone,message); else if(whatsapp) await sharePdf(doc,fileName,message); else doc.save(fileName);
    } finally { setBusy(false); }
  }
  return <div className='flex flex-col gap-2 sm:flex-row'><button disabled={busy} onClick={()=>run(false)} className='btn btn-secondary'><FileDown size={17}/>{busy?'Preparing...':'Download PDF'}</button><button disabled={busy} onClick={async()=>{try{await run(false,true);alert('PDF sent to customer WhatsApp successfully.')}catch(e){alert(e instanceof Error?e.message:'WhatsApp send failed.')}}} className='btn btn-primary'><MessageCircle size={17}/>{busy?'Sending...':'Send on WhatsApp'}</button></div>;
}

export function PaymentPdfActions({data}:{data:PaymentPdfData}) {
  const [busy,setBusy]=useState(false);
  async function run(whatsapp=false, direct=false){
    setBusy(true);
    try {
      const doc=await buildPaymentPdf(data);
      const fileName=data.paymentNo+'.pdf';
      const message='Bangladesh Tours & Travels\\nPayment Receipt '+data.paymentNo+'\\nCustomer: '+data.customerName+'\\nReceived: BDT '+data.amount.toLocaleString('en-IN')+'\\nRemaining Due: BDT '+data.remainingDue.toLocaleString('en-IN')+'\\nPlease find the receipt attached.';
      if(whatsapp) await sharePdf(doc,fileName,message); else doc.save(fileName);
    } finally { setBusy(false); }
  }
  return <div className='flex flex-col gap-2 sm:flex-row'><button disabled={busy} onClick={()=>run(false)} className='btn btn-secondary'><FileDown size={17}/>{busy?'Preparing...':'Download Receipt'}</button><button disabled={busy} onClick={async()=>{try{await run(false,true);alert('Receipt sent to customer WhatsApp successfully.')}catch(e){alert(e instanceof Error?e.message:'WhatsApp send failed.')}}} className='btn btn-primary'><MessageCircle size={17}/>{busy?'Sending...':'Send on WhatsApp'}</button></div>;
}
