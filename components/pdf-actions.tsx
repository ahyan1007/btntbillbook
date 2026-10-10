'use client';

import { useEffect, useRef, useState } from 'react';
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

// Re-prepare generated PDFs when the user returns to this browser tab.
// Business branding/template may have been changed in another tab meanwhile.
function useTabResumeVersion() {
  const [version, setVersion] = useState(0);
  const lastRefresh = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh.current < 300) return;
      lastRefresh.current = now;
      setVersion((current) => current + 1);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return version;
}

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
  const tabResumeVersion = useTabResumeVersion();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [preparedDoc, setPreparedDoc] = useState<any>(null);
  const [preparing, setPreparing] = useState(true);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const dataKey = JSON.stringify(data);

  useEffect(() => {
    let cancelled = false;

    setPreparing(true);
    setPreparedDoc(null);
    setPrepareError(null);

    async function prepare() {
      try {
        if (!data.customerId || !data.createdAt) {
          throw new Error('This bill is missing its historical balance reference.');
        }

        // Reconstruct the signed customer balance immediately before this bill was created.
        // The same bill's payment entry shares its transaction timestamp, so strict < excludes
        // current-bill postings and preserves the pre-bill advance rather than today's balance.
        const priorEntries: Array<{ debit: number | string | null; credit: number | string | null }> = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const { data: chunk, error } = await supabase
            .from('customer_ledger_entries')
            .select('id,debit,credit,created_at')
            .eq('customer_id', data.customerId)
            .lt('created_at', data.createdAt)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw new Error('Could not load the customer ledger snapshot: ' + error.message);
          priorEntries.push(...(chunk || []));
          if (!chunk || chunk.length < pageSize) break;
        }

        const startingBalance = priorEntries.reduce(
          (balance: number, entry) => balance + Number(entry.debit || 0) - Number(entry.credit || 0),
          0,
        );
        const subtotal = Number(data.subtotal || 0);
        const paidNow = Number(data.paidNow || 0);
        const advanceApplied = Math.min(Math.max(-startingBalance, 0), subtotal);
        const advanceAmount = Math.max(-(startingBalance + subtotal - paidNow), 0);

        const doc = await buildBillPdf({ ...data, advanceApplied, advanceAmount });
        if (!cancelled) {
          setPreparedDoc(doc);
          setPreparing(false);
        }
      } catch (error) {
        if (!cancelled) {
          setPrepareError(error instanceof Error ? error.message : 'Could not prepare accurate bill PDF.');
          setPreparing(false);
        }
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [dataKey, tabResumeVersion]);

  const fileName = data.billNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nBill ' +
    data.billNo +
    '\nCustomer: ' +
    data.customerName +
    '\nToday\'s Bill: INR ' +
    data.subtotal.toLocaleString('en-IN') +
    '\nTotal Due: INR ' +
    data.totalDue.toLocaleString('en-IN') +
    (Number(data.advanceApplied||0)>0 ? '\nAdvance Applied: INR ' + Number(data.advanceApplied).toLocaleString('en-IN') : '') +
    (Number(data.advanceAmount||0)>0 ? '\nCustomer Advance: INR ' + Number(data.advanceAmount).toLocaleString('en-IN') : '') +
    (data.description ? '\nDescription: ' + data.description : '') +
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
  const tabResumeVersion = useTabResumeVersion();
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
  }, [dataKey, tabResumeVersion]);

  const fileName = data.billNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nBill ' +
    data.billNo +
    '\nCustomer: ' +
    data.customerName +
    '\nToday\'s Bill: INR ' +
    data.subtotal.toLocaleString('en-IN') +
    '\nTotal Due: INR ' +
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
      {prepareError && <p role='alert' className='w-full break-words text-left text-xs text-red-700'>Bill PDF could not be prepared with verified advance details: {prepareError}</p>}
      <button
        disabled={busyAction !== null || preparing || !!prepareError}
        onClick={() => void run('download')}
        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50'
      >
        <span className='inline-flex items-center gap-1.5'>
          <FileDown size={15} />
          {preparing ? 'Preparing...' : busyAction === 'download' ? 'Preparing...' : 'PDF'}
        </span>
      </button>
      <button
        disabled={busyAction !== null || preparing || !!prepareError}
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
  const tabResumeVersion = useTabResumeVersion();
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
  }, [dataKey, tabResumeVersion]);

  const fileName = data.paymentNo + '.pdf';
  const message =
    'Bangladesh Tours & Travels\nPayment Receipt ' +
    data.paymentNo +
    '\nCustomer: ' +
    data.customerName +
    '\nReceived: INR ' +
    data.amount.toLocaleString('en-IN') +
    '\nRemaining Due: INR ' +
    data.remainingDue.toLocaleString('en-IN') +
    (Number(data.advanceAmount||0)>0 ? '\nCustomer Advance: INR ' + Number(data.advanceAmount).toLocaleString('en-IN') : '') +
    (data.note ? '\nDescription: ' + data.note : '') +
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
