'use client';

import { useEffect, useState } from 'react';
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
  const [preparedDoc, setPreparedDoc] = useState<any>(null);
  const [preparing, setPreparing] = useState(true);

  const dataKey = JSON.stringify(data);

  useEffect(() => {
    let cancelled = false;

    setPreparing(true);
    setPreparedDoc(null);

    buildBillPdf(data)
      .then((doc) => {
        if (!cancelled) {
          setPreparedDoc(doc);
          setPreparing(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataKey]);

  const fileName = data.billNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nBill ' +
    data.billNo +
    '\nCustomer: ' +
    data.customerName +
    '\nToday\'s Bill: BDT ' +
    data.subtotal.toLocaleString('en-IN') +
    '\nTotal Due: BDT ' +
    data.totalDue.toLocaleString('en-IN') +
    '\nPlease find the bill attached.';

  async function download() {
    setBusyAction('download');
    try {
      const doc = preparedDoc || (await buildBillPdf(data));
      doc.save(fileName);
    } finally {
      setBusyAction(null);
    }
  }

  async function shareWeb() {
    if (!preparedDoc) {
      alert('PDF is still preparing. Please tap Share PDF again in a moment.');
      return;
    }

    // IMPORTANT: navigator.share() must happen directly from the user gesture.
    // The PDF is pre-generated above the click, so there is no async build before share.
    setBusyAction('web');
    try {
      await sharePdf(preparedDoc, fileName, message);
    } finally {
      setBusyAction(null);
    }
  }

  async function directSend() {
    setBusyAction('direct');
    try {
      const doc = preparedDoc || (await buildBillPdf(data));
      await sendPdfToWhatsApp(doc, fileName, data.customerPhone, message);
      alert('PDF sent to customer WhatsApp successfully.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'WhatsApp send failed.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void download()}
        className='btn btn-secondary'
      >
        <FileDown size={17} />
        {preparing ? 'Preparing PDF...' : busyAction === 'download' ? 'Preparing...' : 'Download PDF'}
      </button>

      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void shareWeb()}
        className='btn btn-secondary'
      >
        <MessageCircle size={17} />
        {preparing ? 'Preparing Share...' : busyAction === 'web' ? 'Opening Share...' : 'Share PDF'}
      </button>

      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void directSend()}
        className='btn btn-primary'
      >
        <MessageCircle size={17} />
        {preparing ? 'Preparing PDF...' : busyAction === 'direct' ? 'Sending...' : 'Send on WhatsApp'}
      </button>
    </div>
  );
}

export function BillHistoryPdfActions({ data }: { data: BillPdfData }) {
  const [busyAction, setBusyAction] = useState<'download' | 'web' | null>(null);
  const [preparedDoc, setPreparedDoc] = useState<any>(null);
  const [preparing, setPreparing] = useState(true);

  const dataKey = JSON.stringify(data);

  useEffect(() => {
    let cancelled = false;

    setPreparing(true);
    setPreparedDoc(null);

    buildBillPdf(data)
      .then((doc) => {
        if (!cancelled) {
          setPreparedDoc(doc);
          setPreparing(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataKey]);

  const fileName = data.billNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nBill ' +
    data.billNo +
    '\nCustomer: ' +
    data.customerName +
    '\nToday\'s Bill: BDT ' +
    data.subtotal.toLocaleString('en-IN') +
    '\nTotal Due: BDT ' +
    data.totalDue.toLocaleString('en-IN') +
    '\nPlease find the bill attached.';

  async function run(action: 'download' | 'web') {
    if (!preparedDoc) {
      alert('PDF is still preparing. Please tap again in a moment.');
      return;
    }

    setBusyAction(action);
    try {
      if (action === 'web') {
        await sharePdf(preparedDoc, fileName, message);
      } else {
        preparedDoc.save(fileName);
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void run('download')}
        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50'
      >
        <span className='inline-flex items-center gap-1.5'>
          <FileDown size={15} />
          {preparing ? 'Preparing...' : busyAction === 'download' ? 'Preparing...' : 'PDF'}
        </span>
      </button>
      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void run('web')}
        className='rounded-lg bg-brand-blue px-3 py-2 text-xs font-bold text-white hover:opacity-90'
      >
        <span className='inline-flex items-center gap-1.5'>
          <MessageCircle size={15} />
          {preparing ? 'Preparing...' : busyAction === 'web' ? 'Opening...' : 'Share PDF'}
        </span>
      </button>
    </div>
  );
}

export function PaymentPdfActions({ data }: { data: PaymentPdfData }) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [preparedDoc, setPreparedDoc] = useState<any>(null);
  const [preparing, setPreparing] = useState(true);

  const dataKey = JSON.stringify(data);

  useEffect(() => {
    let cancelled = false;

    setPreparing(true);
    setPreparedDoc(null);

    buildPaymentPdf(data)
      .then((doc) => {
        if (!cancelled) {
          setPreparedDoc(doc);
          setPreparing(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataKey]);

  const fileName = data.paymentNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nPayment Receipt ' +
    data.paymentNo +
    '\nCustomer: ' +
    data.customerName +
    '\nReceived: BDT ' +
    data.amount.toLocaleString('en-IN') +
    '\nRemaining Due: BDT ' +
    data.remainingDue.toLocaleString('en-IN') +
    '\nPlease find the receipt attached.';

  async function download() {
    setBusyAction('download');
    try {
      const doc = preparedDoc || (await buildPaymentPdf(data));
      doc.save(fileName);
    } finally {
      setBusyAction(null);
    }
  }

  async function shareWeb() {
    if (!preparedDoc) {
      alert('PDF is still preparing. Please tap Share PDF again in a moment.');
      return;
    }

    setBusyAction('web');
    try {
      await sharePdf(preparedDoc, fileName, message);
    } finally {
      setBusyAction(null);
    }
  }

  async function directSend() {
    setBusyAction('direct');
    try {
      const doc = preparedDoc || (await buildPaymentPdf(data));
      await sendPdfToWhatsApp(doc, fileName, data.customerPhone, message);
      alert('Receipt sent to customer WhatsApp successfully.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'WhatsApp send failed.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void download()}
        className='btn btn-secondary'
      >
        <FileDown size={17} />
        {preparing ? 'Preparing PDF...' : busyAction === 'download' ? 'Preparing...' : 'Download Receipt'}
      </button>

      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void shareWeb()}
        className='btn btn-secondary'
      >
        <MessageCircle size={17} />
        {preparing ? 'Preparing Share...' : busyAction === 'web' ? 'Opening Share...' : 'Share PDF'}
      </button>

      <button
        disabled={busyAction !== null || preparing}
        onClick={() => void directSend()}
        className='btn btn-primary'
      >
        <MessageCircle size={17} />
        {preparing ? 'Preparing PDF...' : busyAction === 'direct' ? 'Sending...' : 'Send on WhatsApp'}
      </button>
    </div>
  );
}
