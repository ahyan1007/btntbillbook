'use client';

import { useState } from 'react';
import { FileDown, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  buildBillPdf,
  buildPaymentPdf,
  sharePdf,
  type BillPdfData,
  type PaymentPdfData,
} from '@/lib/pdf';

type BusyAction = 'download' | 'web' | 'direct' | null;

async function sendPdfToWhatsApp(
  doc: any,
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

  const { error } = await supabase.functions.invoke('send-whatsapp-pdf', {
    body: {
      phone,
      fileName,
      caption: message || '',
      pdfBase64: btoa(binary),
    },
  });

  if (error) throw new Error(error.message || 'WhatsApp send failed.');
}

export function BillPdfActions({ data }: { data: BillPdfData }) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function run(action: Exclude<BusyAction, null>) {
    setBusyAction(action);

    try {
      const doc = await buildBillPdf(data);
      const fileName = data.billNo + '.pdf';
      const message =
        'Bangladesh Tours & Travels\\nBill ' +
        data.billNo +
        '\\nCustomer: ' +
        data.customerName +
        '\\nToday\'s Bill: BDT ' +
        data.subtotal.toLocaleString('en-IN') +
        '\\nTotal Due: BDT ' +
        data.totalDue.toLocaleString('en-IN') +
        '\\nPlease find the bill attached.';

      if (action === 'direct') {
        await sendPdfToWhatsApp(doc, fileName, data.customerPhone, message);
        return;
      }

      if (action === 'web') {
        await sharePdf(doc, fileName, message);
        return;
      }

      doc.save(fileName);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <button
        disabled={busyAction !== null}
        onClick={() => void run('download')}
        className='btn btn-secondary'
      >
        <FileDown size={17} />
        {busyAction === 'download' ? 'Preparing...' : 'Download PDF'}
      </button>

      <button
        disabled={busyAction !== null}
        onClick={() => void run('web')}
        className='btn btn-secondary'
      >
        <MessageCircle size={17} />
        {busyAction === 'web' ? 'Opening...' : 'Share on WhatsApp Web'}
      </button>

      <button
        disabled={busyAction !== null}
        onClick={async () => {
          try {
            await run('direct');
            alert('PDF sent to customer WhatsApp successfully.');
          } catch (e) {
            alert(e instanceof Error ? e.message : 'WhatsApp send failed.');
          }
        }}
        className='btn btn-primary'
      >
        <MessageCircle size={17} />
        {busyAction === 'direct' ? 'Sending...' : 'Send on WhatsApp'}
      </button>
    </div>
  );
}

export function BillHistoryPdfActions({ data }: { data: BillPdfData }) {
  const [busyAction, setBusyAction] = useState<'download' | 'web' | null>(null);

  async function run(action: 'download' | 'web') {
    setBusyAction(action);
    try {
      const doc = await buildBillPdf(data);
      const fileName = data.billNo + '.pdf';
      const message =
        'Bangladesh Tours & Travels\\nBill ' +
        data.billNo +
        '\\nCustomer: ' +
        data.customerName +
        '\\nToday\'s Bill: BDT ' +
        data.subtotal.toLocaleString('en-IN') +
        '\\nTotal Due: BDT ' +
        data.totalDue.toLocaleString('en-IN') +
        '\\nPlease find the bill attached.';

      if (action === 'web') {
        await sharePdf(doc, fileName, message);
      } else {
        doc.save(fileName);
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <button
        disabled={busyAction !== null}
        onClick={() => void run('download')}
        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50'
      >
        <span className='inline-flex items-center gap-1.5'>
          <FileDown size={15} />
          {busyAction === 'download' ? 'Preparing...' : 'PDF'}
        </span>
      </button>
      <button
        disabled={busyAction !== null}
        onClick={() => void run('web')}
        className='rounded-lg bg-brand-blue px-3 py-2 text-xs font-bold text-white hover:opacity-90'
      >
        <span className='inline-flex items-center gap-1.5'>
          <MessageCircle size={15} />
          {busyAction === 'web' ? 'Opening...' : 'Share PDF'}
        </span>
      </button>
    </div>
  );
}

export function PaymentPdfActions({ data }: { data: PaymentPdfData }) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function run(action: Exclude<BusyAction, null>) {
    setBusyAction(action);

    try {
      const doc = await buildPaymentPdf(data);
      const fileName = data.paymentNo + '.pdf';
      const message =
        'Bangladesh Tours & Travels\\nPayment Receipt ' +
        data.paymentNo +
        '\\nCustomer: ' +
        data.customerName +
        '\\nReceived: BDT ' +
        data.amount.toLocaleString('en-IN') +
        '\\nRemaining Due: BDT ' +
        data.remainingDue.toLocaleString('en-IN') +
        '\\nPlease find the receipt attached.';

      if (action === 'direct') {
        await sendPdfToWhatsApp(doc, fileName, data.customerPhone, message);
        return;
      }

      if (action === 'web') {
        await sharePdf(doc, fileName, message);
        return;
      }

      doc.save(fileName);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <button
        disabled={busyAction !== null}
        onClick={() => void run('download')}
        className='btn btn-secondary'
      >
        <FileDown size={17} />
        {busyAction === 'download' ? 'Preparing...' : 'Download Receipt'}
      </button>

      <button
        disabled={busyAction !== null}
        onClick={() => void run('web')}
        className='btn btn-secondary'
      >
        <MessageCircle size={17} />
        {busyAction === 'web' ? 'Opening...' : 'Share on WhatsApp Web'}
      </button>

      <button
        disabled={busyAction !== null}
        onClick={async () => {
          try {
            await run('direct');
            alert('Receipt sent to customer WhatsApp successfully.');
          } catch (e) {
            alert(e instanceof Error ? e.message : 'WhatsApp send failed.');
          }
        }}
        className='btn btn-primary'
      >
        <MessageCircle size={17} />
        {busyAction === 'direct' ? 'Sending...' : 'Send on WhatsApp'}
      </button>
    </div>
  );
}
