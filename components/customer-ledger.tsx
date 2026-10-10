'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, ReceiptText, WalletCards } from 'lucide-react';

type Props={customerId:string;onClose:()=>void};

export function CustomerLedger({customerId,onClose}:Props){
  const [customer,setCustomer]=useState<any>(null);
  const [bills,setBills]=useState<any[]>([]);
  const [payments,setPayments]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [balanceError,setBalanceError]=useState<string|null>(null);

  useEffect(()=>{
    async function load(){
      setLoading(true);
      const [c,l,b,p]=await Promise.all([
        supabase.from('customer_balances').select('id,name,phone,address,current_due').eq('id',customerId).single(),
        supabase.from('customer_ledger_balances').select('id,current_balance').eq('id',customerId).single(),
        supabase.from('bills').select('id,bill_no,bill_date,subtotal,paid_now,total_due,notes').eq('customer_id',customerId).order('created_at',{ascending:false}),
        supabase.from('payments').select('id,payment_no,payment_date,amount,payment_method,notes').eq('customer_id',customerId).order('created_at',{ascending:false})
      ]);
      const signedBalance = l.error ? Number.NaN : Number(l.data?.current_balance ?? 0);
      setBalanceError(l.error ? 'Signed balance could not be verified: '+l.error.message : null);
      setCustomer(c.data ? {
        ...c.data,
        current_balance: signedBalance,
        current_advance: Number.isFinite(signedBalance) ? Math.max(-signedBalance,0) : Number.NaN,
      } : null);
      setBills(b.data||[]);setPayments(p.data||[]);setLoading(false);
    }
    load();
  },[customerId]);

  return <div className='fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 p-0 sm:p-4'><div className='min-h-screen bg-white sm:mx-auto sm:my-6 sm:min-h-0 sm:max-w-4xl sm:rounded-3xl sm:shadow-2xl'>
    <div className='sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-4 sm:rounded-t-3xl sm:p-5'>
      <div className='min-w-0 pr-3'><p className='text-xs font-black uppercase tracking-widest text-brand-blue'>Customer Ledger</p><h2 className='mt-1 truncate text-xl font-black sm:text-2xl'>{customer?.name||'Loading...'}</h2><p className='mt-1 truncate text-xs text-slate-400'>{customer?.phone||'No mobile'}</p></div>
      <button onClick={onClose} className='grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-50' aria-label='Close ledger'><X size={21}/></button>
    </div>
    {loading?<div className='p-10 text-center text-sm text-slate-400'>Loading ledger...</div>:<div className='p-4 sm:p-5'>
      {balanceError&&<div role='alert' className='mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>{balanceError}</div>}
      <div className='grid gap-3 md:grid-cols-4'>
        <div className='rounded-2xl bg-orange-50 p-4'><p className='text-xs text-slate-500'>Current Due</p><p className='mt-1 text-2xl font-black text-brand-orange'>₹ {Number(customer?.current_due||0).toLocaleString('en-IN')}</p></div>
        <div className='rounded-2xl bg-emerald-50 p-4'><p className='text-xs text-emerald-700'>Customer Advance</p><p className='mt-1 text-2xl font-black text-emerald-800'>{Number.isFinite(Number(customer?.current_advance))?'₹ '+Number(customer?.current_advance||0).toLocaleString('en-IN'):'—'}</p></div>
        <div className='rounded-2xl bg-slate-50 p-4'><p className='text-xs text-slate-400'>Bills</p><p className='mt-1 text-2xl font-black'>{bills.length}</p></div>
        <div className='rounded-2xl bg-slate-50 p-4'><p className='text-xs text-slate-400'>Payments</p><p className='mt-1 text-2xl font-black'>{payments.length}</p></div>
      </div>
      <div className='mt-6 grid gap-6 lg:grid-cols-2'>
        <section className='rounded-2xl border border-slate-200 overflow-hidden'><div className='flex items-center gap-2 border-b border-slate-100 p-4 font-black'><ReceiptText size={17} className='text-brand-blue'/> Bills</div><div className='divide-y divide-slate-100'>{bills.map(b=><div key={b.id} className='p-4'><div className='flex justify-between gap-3'><div><p className='font-bold'>{b.bill_no}</p><p className='text-xs text-slate-400'>{new Date(b.bill_date).toLocaleDateString('en-GB')}</p>{b.notes&&<p className='mt-1 whitespace-pre-wrap break-words text-xs text-slate-600'><b>Description: </b>{b.notes}</p>}</div><b className='shrink-0'>₹ {Number(b.subtotal).toLocaleString('en-IN')}</b></div><div className='mt-2 flex justify-between text-xs'><span className='text-slate-400'>Paid ₹ {Number(b.paid_now).toLocaleString('en-IN')}</span><span className='font-bold text-brand-orange'>Due ₹ {Number(b.total_due).toLocaleString('en-IN')}</span></div></div>)}{!bills.length&&<p className='p-6 text-sm text-slate-400'>No bills yet.</p>}</div></section>
        <section className='rounded-2xl border border-slate-200 overflow-hidden'><div className='flex items-center gap-2 border-b border-slate-100 p-4 font-black'><WalletCards size={17} className='text-brand-orange'/> Payments</div><div className='divide-y divide-slate-100'>{payments.map(p=><div key={p.id} className='p-4'><div className='flex justify-between gap-3'><div><p className='font-bold'>{p.payment_no}</p><p className='text-xs text-slate-400'>{new Date(p.payment_date).toLocaleDateString('en-GB')} · {p.payment_method}</p></div><b className='text-emerald-600'>₹ {Number(p.amount).toLocaleString('en-IN')}</b></div>{p.notes&&<p className='mt-2 whitespace-pre-wrap break-words text-xs text-slate-500'><b>Description: </b>{p.notes}</p>}</div>)}{!payments.length&&<p className='p-6 text-sm text-slate-400'>No payments yet.</p>}</div></section>
      </div>
    </div>}
  </div></div>;
}
