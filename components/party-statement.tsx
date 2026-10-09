'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildPartyStatementPdf, type PartyStatementPdfData, type PartyStatementTransaction } from '@/lib/statement-pdf';

type Party = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  opening_due?: number | null;
  current_due?: number | null;
};

type BillRecord = {
  id: string;
  bill_no: string;
  bill_date: string;
  subtotal: number;
  created_at?: string | null;
};

type PaymentRecord = {
  id: string;
  payment_no: string;
  payment_date: string;
  amount: number;
  payment_method?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type PartyStatement = PartyStatementPdfData;

function localDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}
function money(value: number) {
  return '₹ ' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function dateLabel(value: string) {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'party';
}

async function fetchPartyRows<T>(
  table: 'bills' | 'payments',
  partyId: string,
  endDate: string,
): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const query = table === 'bills'
      ? supabase.from('bills').select('id,bill_no,bill_date,subtotal,created_at').eq('customer_id', partyId).lte('bill_date', endDate).order('bill_date', { ascending: true }).order('created_at', { ascending: true }).range(offset, offset + pageSize - 1)
      : supabase.from('payments').select('id,payment_no,payment_date,amount,payment_method,notes,created_at').eq('customer_id', partyId).lte('payment_date', endDate).order('payment_date', { ascending: true }).order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const chunk = (data || []) as unknown as T[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function PartyStatement() {
  const today = useMemo(() => localDate(new Date()), []);
  const monthStart = useMemo(() => {
    const now = new Date();
    return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState('');
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [statement, setStatement] = useState<PartyStatement | null>(null);
  const [loadingParties, setLoadingParties] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    supabase.from('customer_balances').select('id,name,phone,address,opening_due,current_due').order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setErrorMessage(error.message);
        setParties((data as Party[]) || []);
        setLoadingParties(false);
      });
    return () => { active = false; };
  }, []);

  async function generateStatement() {
    setErrorMessage('');
    setStatement(null);
    if (!partyId) { setErrorMessage('Please select a party/customer.'); return; }
    if (!fromDate || !toDate) { setErrorMessage('Please select both statement dates.'); return; }
    if (fromDate > toDate) { setErrorMessage('From date cannot be after To date.'); return; }
    setGenerating(true);
    try {
      const party = parties.find((item) => item.id === partyId);
      if (!party) throw new Error('Selected customer was not found.');

      const [bills, payments] = await Promise.all([
        fetchPartyRows<BillRecord>('bills', partyId, toDate),
        fetchPartyRows<PaymentRecord>('payments', partyId, toDate),
      ]);

      const priorBills = bills.filter((bill) => bill.bill_date < fromDate);
      const priorPayments = payments.filter((payment) => payment.payment_date < fromDate);
      const openingBalance = Number(party.opening_due || 0)
        + priorBills.reduce((sum, bill) => sum + Number(bill.subtotal || 0), 0)
        - priorPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      const rows: PartyStatementTransaction[] = [
        ...bills.filter((bill) => bill.bill_date >= fromDate && bill.bill_date <= toDate).map((bill) => ({
          date: bill.bill_date,
          type: 'Bill' as const,
          reference: bill.bill_no,
          description: 'Travel / booking bill',
          debit: Number(bill.subtotal || 0),
          credit: 0,
          balance: 0,
          createdAt: bill.created_at || '',
        })),
        ...payments.filter((payment) => payment.payment_date >= fromDate && payment.payment_date <= toDate).map((payment) => ({
          date: payment.payment_date,
          type: 'Payment' as const,
          reference: payment.payment_no,
          description: [payment.payment_method || 'Payment', payment.notes].filter(Boolean).join(' · '),
          debit: 0,
          credit: Number(payment.amount || 0),
          balance: 0,
          createdAt: payment.created_at || '',
        })),
      ] as (PartyStatementTransaction & { createdAt: string })[];

      // When dates match, list bills before receipts so the running balance is easy to follow.
      rows.sort((a, b) => a.date.localeCompare(b.date)
        || (a.type === b.type ? 0 : a.type === 'Bill' ? -1 : 1)
        || String((a as any).createdAt).localeCompare(String((b as any).createdAt)));

      let runningBalance = openingBalance;
      rows.forEach((row) => {
        runningBalance += row.debit - row.credit;
        row.balance = runningBalance;
      });

      setStatement({
        companyName: 'Bangladesh Tours & Travels',
        partyName: party.name,
        partyPhone: party.phone || null,
        partyAddress: party.address || null,
        fromDate,
        toDate,
        openingBalance,
        totalBills: rows.reduce((sum, row) => sum + row.debit, 0),
        totalPayments: rows.reduce((sum, row) => sum + row.credit, 0),
        closingBalance: runningBalance,
        transactions: rows.map(({ date, type, reference, description, debit, credit, balance }) => ({ date, type, reference, description, debit, credit, balance })),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not generate the party statement.');
    } finally {
      setGenerating(false);
    }
  }

  async function downloadPdf() {
    if (!statement) return;
    setDownloading(true);
    try {
      const doc = await buildPartyStatementPdf(statement);
      doc.save('Party-Statement-' + safeFilePart(statement.partyName) + '-' + statement.fromDate + '-to-' + statement.toDate + '.pdf');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'PDF download failed.');
    } finally {
      setDownloading(false);
    }
  }

  function downloadCsv() {
    if (!statement) return;
    const csvCell = (value: string | number) => {
      let text = String(value ?? '');
      if (/^[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csvRows: (string | number)[][] = [
      ['Party Statement', statement.partyName],
      ['Period', statement.fromDate + ' to ' + statement.toDate],
      ['Opening Balance (INR)', statement.openingBalance],
      ['Bills (INR)', statement.totalBills],
      ['Payments (INR)', statement.totalPayments],
      ['Closing Balance (INR)', statement.closingBalance],
      [],
      ['Date', 'Type', 'Reference', 'Details', 'Debit (INR)', 'Credit (INR)', 'Running Balance (INR)'],
      ...statement.transactions.map((row) => [row.date, row.type, row.reference, row.description, row.debit, row.credit, row.balance]),
    ];
    const csv = '\uFEFF' + csvRows.map((row) => row.map((value) => csvCell(value ?? '')).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Party-Statement-' + safeFilePart(statement.partyName) + '-' + statement.fromDate + '-to-' + statement.toDate + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectedParty = parties.find((party) => party.id === partyId);

  return <>
    <div className='flex flex-col justify-between gap-4 md:flex-row md:items-end'>
      <div>
        <p className='text-sm font-bold text-brand-blue'>Bangladesh Tours & Travels</p>
        <h1 className='mt-1 text-3xl font-black tracking-tight'>Party-wise Statement</h1>
        <p className='mt-2 text-sm text-slate-500'>Customer account statement with opening balance, bills, payments and running due.</p>
      </div>
    </div>

    <section className='card mt-6 p-4 sm:p-6'>
      <div className='grid gap-4 md:grid-cols-[minmax(0,1.5fr)_1fr_1fr]'>
        <div>
          <label className='label'>Party / Customer</label>
          <div className='relative'>
            <Search size={17} className='pointer-events-none absolute left-3 top-3.5 text-slate-400'/>
            <select className='field pl-10' value={partyId} disabled={loadingParties} onChange={(event) => { setPartyId(event.target.value); setStatement(null); setErrorMessage(''); }}>
              <option value=''>{loadingParties ? 'Loading parties...' : 'Select party/customer'}</option>
              {parties.map((party) => <option key={party.id} value={party.id}>{party.name}{party.phone ? ' — ' + party.phone : ''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className='label'>From date</label>
          <input className='field' type='date' value={fromDate} max={toDate} onChange={(event) => { setFromDate(event.target.value); setStatement(null); setErrorMessage(''); }}/>
        </div>
        <div>
          <label className='label'>To date</label>
          <input className='field' type='date' value={toDate} min={fromDate} onChange={(event) => { setToDate(event.target.value); setStatement(null); setErrorMessage(''); }}/>
        </div>
      </div>
      <div className='mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-xs leading-5 text-slate-400'>Opening balance automatically carries forward all bills and payments before the selected From date.</p>
        <button type='button' disabled={generating || loadingParties || !partyId} onClick={generateStatement} className='btn btn-primary w-full sm:w-auto'>
          <RefreshCw size={17} className={generating ? 'animate-spin' : ''}/>{generating ? 'Generating...' : 'Generate Statement'}
        </button>
      </div>
      {errorMessage && <p role='alert' className='mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700'>{errorMessage}</p>}
    </section>

    {statement && <>
      <section className='mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <div className='card p-4'><p className='text-xs font-bold uppercase tracking-wide text-slate-400'>Opening Balance</p><p className='mt-2 text-xl font-black'>{money(statement.openingBalance)}</p></div>
        <div className='card p-4'><p className='text-xs font-bold uppercase tracking-wide text-slate-400'>Bills in Period</p><p className='mt-2 text-xl font-black'>{money(statement.totalBills)}</p></div>
        <div className='card p-4'><p className='text-xs font-bold uppercase tracking-wide text-slate-400'>Payments in Period</p><p className='mt-2 text-xl font-black text-emerald-600'>{money(statement.totalPayments)}</p></div>
        <div className='card border-brand-orange/30 bg-orange-50/70 p-4'><p className='text-xs font-bold uppercase tracking-wide text-brand-orange'>Closing Balance</p><p className='mt-2 text-xl font-black text-brand-orange'>{money(statement.closingBalance)}</p></div>
      </section>

      <section className='card mt-5 overflow-hidden'>
        <div className='flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'>
          <div>
            <h2 className='font-black'>{statement.partyName}</h2>
            <p className='mt-1 text-xs text-slate-400'>{dateLabel(statement.fromDate)} – {dateLabel(statement.toDate)} · {statement.transactions.length} transactions</p>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <button type='button' disabled={downloading} onClick={downloadPdf} className='btn btn-primary'><FileText size={17}/>{downloading ? 'Preparing PDF...' : 'Download PDF'}</button>
            <button type='button' onClick={downloadCsv} className='btn btn-secondary'><FileSpreadsheet size={17}/>Download CSV</button>
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[850px] text-left text-sm'>
            <thead className='bg-slate-50 text-xs uppercase tracking-wide text-slate-500'><tr><th className='px-4 py-3'>Date</th><th className='px-4 py-3'>Type</th><th className='px-4 py-3'>Reference</th><th className='px-4 py-3'>Details</th><th className='px-4 py-3 text-right'>Debit</th><th className='px-4 py-3 text-right'>Credit</th><th className='px-4 py-3 text-right'>Running Balance</th></tr></thead>
            <tbody className='divide-y divide-slate-100'>
              <tr className='bg-blue-50/50'><td className='px-4 py-3 font-semibold'>{dateLabel(statement.fromDate)}</td><td className='px-4 py-3' colSpan={3}>Opening Balance</td><td className='px-4 py-3 text-right'>—</td><td className='px-4 py-3 text-right'>—</td><td className='px-4 py-3 text-right font-bold'>{money(statement.openingBalance)}</td></tr>
              {statement.transactions.map((row, index) => <tr key={row.type + '-' + row.reference + '-' + index} className='hover:bg-slate-50'><td className='whitespace-nowrap px-4 py-3'>{dateLabel(row.date)}</td><td className='px-4 py-3'><span className={'rounded-full px-2 py-1 text-xs font-bold ' + (row.type === 'Bill' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700')}>{row.type}</span></td><td className='px-4 py-3 font-semibold'>{row.reference}</td><td className='max-w-[220px] truncate px-4 py-3 text-slate-500'>{row.description || '—'}</td><td className='px-4 py-3 text-right'>{row.debit ? money(row.debit) : '—'}</td><td className='px-4 py-3 text-right text-emerald-700'>{row.credit ? money(row.credit) : '—'}</td><td className='whitespace-nowrap px-4 py-3 text-right font-bold'>{money(row.balance)}</td></tr>)}
              <tr className='bg-slate-900 text-white'><td className='px-4 py-3 font-bold' colSpan={4}>Closing Balance</td><td className='px-4 py-3 text-right font-bold'>{money(statement.totalBills)}</td><td className='px-4 py-3 text-right font-bold'>{money(statement.totalPayments)}</td><td className='px-4 py-3 text-right font-black'>{money(statement.closingBalance)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </>;
}
