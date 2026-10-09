'use client';
import { useEffect,useMemo,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FilePlus2,Users,WalletCards,ReceiptText,ClipboardList,Plus,Search,LogOut,Trash2,Save,Menu,X,ChevronRight,ChevronDown,Check,Archive,RotateCcw,UserRound } from 'lucide-react';
import { BillPdfActions, BillHistoryPdfActions, PaymentPdfActions } from '@/components/pdf-actions';
import { CustomerLedger } from '@/components/customer-ledger';
import { PwaInstall } from '@/components/pwa-install';
import { PartyStatement } from '@/components/party-statement';

type Customer={id:string;name:string;phone:string|null;address:string|null;current_due:number;opening_due?:number;is_archived?:boolean};
type Item={passenger_name:string;travel_date:string;service_type:string;details:string;amount:string};
type View='dashboard'|'customers'|'bill'|'payments'|'bills'|'statement';

type CustomerLoadResult = { rows: Customer[]; error: string | null; balancesReady: boolean };

async function fetchCustomerRecords(includeArchived = false): Promise<CustomerLoadResult> {
  const base: any[] = [];
  const pageSize = 500;

  for (let start = 0; ; start += pageSize) {
    let query = supabase
      .from('customers')
      .select('id,name,phone,address,opening_due,is_archived')
      .order('name', { ascending: true });
    if (!includeArchived) query = query.eq('is_archived', false);
    const { data, error } = await query.range(start, start + pageSize - 1);

    if (error) {
      return {
        rows: base.map((customer) => ({ ...customer, current_due: Number.NaN })) as Customer[],
        error: 'Could not load all customers: ' + error.message,
        balancesReady: false,
      };
    }

    const chunk = data || [];
    base.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  if (!base.length) return { rows: [], error: null, balancesReady: true };

  const balanceById = new Map<string, number>();
  for (let start = 0; start < base.length; start += 100) {
    const ids = base.slice(start, start + 100).map((customer) => customer.id);
    const { data, error } = await supabase
      .from('customer_balances')
      .select('id,current_due')
      .in('id', ids);

    if (error) {
      return {
        rows: base.map((customer) => ({ ...customer, current_due: Number.NaN })) as Customer[],
        error: 'Customer names loaded, but balances could not be verified. Refresh before recording a bill or payment. ' + error.message,
        balancesReady: false,
      };
    }

    (data || []).forEach((balance: any) => {
      balanceById.set(balance.id, Number(balance.current_due || 0));
    });
  }

  const missingBalances = base.filter((customer) => !balanceById.has(customer.id));
  if (missingBalances.length) {
    return {
      rows: base.map((customer) => ({ ...customer, current_due: Number.NaN })) as Customer[],
      error: 'Loaded all customer names, but the balance view returned no balance for ' + missingBalances.length + ' customer(s). No bill or payment will be saved until balances can be verified.',
      balancesReady: false,
    };
  }

  return {
    rows: base.map((customer) => ({
      ...customer,
      current_due: balanceById.get(customer.id) ?? 0,
    })) as Customer[],
    error: null,
    balancesReady: true,
  };
}


function Brand({compact=false}:{compact?:boolean}){return <div className='flex items-center gap-3'><div className='grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white ring-1 ring-slate-200'><svg viewBox='0 0 64 64' className='h-10 w-10'><circle cx='39' cy='20' r='13' fill='#f7941d'/><path d='M13 48c10-15 21-24 38-30-9 8-17 18-24 30' fill='none' stroke='#1487c9' strokeWidth='5' strokeLinecap='round'/><path d='M24 39c-4-8-3-18 4-26M25 29c-5-3-9-3-14-1M28 23c-1-5-4-9-8-12' fill='none' stroke='#1487c9' strokeWidth='3' strokeLinecap='round'/><path d='M34 31l20-7-8 7 8 3-20 2 6-3z' fill='#1487c9'/></svg></div>{!compact&&<div><div className='text-[18px] font-black leading-none text-brand-blue'>Bangladesh Tours & Travels</div><div className='mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400'>Bill Book</div></div>}</div>}

export default function Home(){
 const [session,setSession]=useState<any>(null); const [loading,setLoading]=useState(true); const [authorizing,setAuthorizing]=useState(false); const [authorized,setAuthorized]=useState(false);
 const [view,setView]=useState<View>('dashboard'); const [mobile,setMobile]=useState(false);
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [authMsg,setAuthMsg]=useState('');
 useEffect(()=>{
  let active=true;
  supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setLoading(false)}});
  const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>{if(active)setSession(s)});
  return()=>{active=false;l.subscription.unsubscribe()};
 },[]);
 useEffect(()=>{
  if(!session){setAuthorized(false);setAuthorizing(false);return}
  let active=true;
  setAuthorizing(true);
  supabase.from('admin_users').select('role').eq('user_id',session.user.id).maybeSingle().then(async({data,error})=>{
    if(!active)return;
    const ok=!error&&data?.role==='admin';
    setAuthorized(!!ok);
    setAuthorizing(false);
    if(!ok){
      await supabase.auth.signOut();
      if(active){setSession(null);setAuthMsg('This account is not authorized as an admin.')}
    }
  });
  return()=>{active=false};
 },[session]);
 if(loading||authorizing)return <div className='grid min-h-screen place-items-center p-6 text-sm text-slate-500'>{authorizing?'Checking admin access...':'Loading...'}</div>;
 if(!session||!authorized)return <Auth email={email} setEmail={setEmail} password={password} setPassword={setPassword} msg={authMsg} setMsg={setAuthMsg}/>;
 return <Shell view={view} setView={setView} mobile={mobile} setMobile={setMobile}><Content view={view}/></Shell>;
}

function Auth(p:any){async function submit(e:React.FormEvent){e.preventDefault();p.setMsg('');const r=await supabase.auth.signInWithPassword({email:p.email,password:p.password});if(r.error)p.setMsg(r.error.message)}return <main className='grid min-h-screen place-items-center bg-brand-soft p-5'><div className='w-full max-w-md'><div className='mb-8 flex justify-center'><Brand/></div><div className='card p-7'><div className='mb-6 rounded-xl bg-brand-blue/5 p-3 text-center'><p className='text-xs font-bold uppercase tracking-widest text-brand-blue'>Admin Access</p><p className='mt-1 text-xs text-slate-500'>Private billing and customer ledger</p></div><h1 className='text-2xl font-black'>Admin Login</h1><p className='mt-2 text-sm text-slate-500'>Sign in with the admin account created in Supabase.</p><form onSubmit={submit} className='mt-7 space-y-4'><div><label className='label'>Admin email</label><input className='field' type='email' value={p.email} onChange={(e:any)=>p.setEmail(e.target.value)} required autoComplete='username'/></div><div><label className='label'>Password</label><input className='field' type='password' value={p.password} onChange={(e:any)=>p.setPassword(e.target.value)} minLength={6} required autoComplete='current-password'/></div>{p.msg&&<div className='rounded-xl bg-red-50 p-3 text-sm text-red-700'>{p.msg}</div>}<button className='btn btn-primary w-full'>Sign in as Admin</button></form><p className='mt-5 text-center text-xs text-slate-400'>Admin accounts are created and managed from Supabase.</p></div></div></main>}

function Shell({children,view,setView,mobile,setMobile}:{children:React.ReactNode;view:View;setView:(v:View)=>void;mobile:boolean;setMobile:(v:boolean)=>void}) {
  const nav = [
    ['dashboard','Dashboard',WalletCards],
    ['customers','Customers',Users],
    ['bill','New Bill',FilePlus2],
    ['payments','Payments',WalletCards],
    ['bills','Bills',ReceiptText],
    ['statement','Party Statement',ClipboardList],
  ] as const;
  const activeTitle = nav.find(([id]) => id === view)?.[1] || 'Dashboard';
  async function out() { await supabase.auth.signOut(); setMobile(false); }

  return <div className='min-h-screen bg-slate-50'>
    <aside className='fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-slate-950 lg:flex'>
      <div className='border-b border-white/10 p-5'>
        <div className='rounded-2xl bg-white p-3 shadow-lg shadow-black/10'><Brand/></div>
        <div className='mt-5 px-2'><p className='text-[10px] font-black uppercase tracking-[.22em] text-slate-500'>Workspace</p><p className='mt-1 text-sm font-semibold text-slate-200'>Travel operations</p></div>
      </div>
      <nav className='space-y-1 px-3 py-5'>
        {nav.map(([id,label,Icon])=><button type='button' key={id} onClick={()=>setView(id)} className={'group flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-all duration-150 '+(view===id?'bg-gradient-to-r from-brand-blue to-sky-500 text-white shadow-lg shadow-sky-950/25':'text-slate-300 hover:bg-slate-800 hover:text-white')}>
          <span className={'grid h-8 w-8 place-items-center rounded-lg '+(view===id?'bg-white/15':'bg-white/5 group-hover:bg-white/10')}><Icon size={18}/></span>{label}
        </button>)}
      </nav>
      <div className='mt-auto space-y-4 p-4'>
        <div className='rounded-2xl border border-white/10 bg-white/5 p-3'><PwaInstall/></div>
        <button type='button' onClick={out} className='flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-red-500/10 hover:text-red-200'><LogOut size={18}/>Sign out</button>
      </div>
    </aside>

    <div className='lg:pl-72'>
      <header className='sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-3 shadow-sm backdrop-blur-xl sm:px-5 lg:hidden'>
        <button type='button' onClick={()=>setMobile(true)} className='grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50' aria-label='Open menu'><Menu size={22}/></button>
        <div className='flex min-w-0 flex-1 items-center justify-center gap-2.5'>
          <Brand compact/>
          <div className='min-w-0'><p className='truncate text-[10px] font-black uppercase tracking-[.17em] text-slate-400'>Bill Book</p><p className='truncate text-sm font-black text-slate-900'>{activeTitle}</p></div>
        </div>
        <div className='h-11 w-11 shrink-0'/>
      </header>

      {mobile&&<div className='fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] lg:hidden' onClick={()=>setMobile(false)}>
        <aside className='mobile-safe-bottom flex h-full w-[min(88vw,22rem)] flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 p-4 shadow-2xl' onClick={e=>e.stopPropagation()}>
          <div className='flex items-center justify-between gap-3 rounded-2xl bg-white p-3'><Brand/><button type='button' onClick={()=>setMobile(false)} className='grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100' aria-label='Close menu'><X size={22}/></button></div>
          <div className='px-2 pb-2 pt-6'><p className='text-[10px] font-black uppercase tracking-[.22em] text-slate-500'>Workspace</p></div>
          <nav className='space-y-1'>
            {nav.map(([id,label,Icon])=><button type='button' key={id} onClick={()=>{setView(id);setMobile(false)}} className={'flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition '+(view===id?'bg-gradient-to-r from-brand-blue to-sky-500 text-white shadow-lg shadow-sky-950/20':'text-slate-300 hover:bg-slate-800 hover:text-white')}><Icon size={18}/>{label}</button>)}
          </nav>
          <div className='mt-auto space-y-4 pt-6'><div className='rounded-2xl border border-white/10 bg-white/5 p-3'><PwaInstall/></div><button type='button' onClick={out} className='flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-red-500/10 hover:text-red-200'><LogOut size={18}/>Sign out</button></div>
        </aside>
      </div>}

      <main className='mx-auto min-h-[calc(100vh-72px)] max-w-[1440px] p-3 sm:p-5 md:p-8 lg:min-h-screen'>
        {children}
      </main>
    </div>
  </div>;
}

function Content({view}:{view:View}){const [refresh,setRefresh]=useState(0);if(view==='dashboard')return <Dashboard key={refresh}/>;if(view==='customers')return <Customers/>;if(view==='bill')return <NewBill onDone={()=>setRefresh(refresh+1)}/>;if(view==='payments')return <Payments/>;if(view==='bills')return <Bills/>;return <PartyStatement/>}

function Dashboard(){
 const [rows,setRows]=useState<Customer[]>([]);
 const [totalDue,setTotalDue]=useState(0);
 const [customerDueCount,setCustomerDueCount]=useState(0);
 const [uploading,setUploading]=useState(false);
 const [savingBrand,setSavingBrand]=useState(false);
 const [brand,setBrand]=useState<any>({company_name:'Bangladesh Tours & Travels',tagline:'Your Trusted Travel Partner',address:'',phone:'',email:'',website:'',footer_text:'Professional Travel Services',pdf_template:'travel',show_logo:true,logo_url:null,primary_color:'#0f172a',accent_color:'#f7941d'});
 useEffect(()=>{
  Promise.all([
    supabase.from('customer_balances').select('id,name,phone,address,current_due').order('current_due',{ascending:false}).limit(8),
    supabase.from('customer_balances').select('current_due'),
    supabase.from('business_settings').select('logo_url,company_name,tagline,address,phone,email,website,footer_text,pdf_template,show_logo,primary_color,accent_color').maybeSingle()
  ]).then(([list,metrics,settings])=>{
    setRows((list.data as Customer[])||[]);
    const values=(metrics.data||[]).map((x:any)=>Number(x.current_due||0));
    setTotalDue(values.reduce((sum,n)=>sum+n,0));
    setCustomerDueCount(values.filter(n=>n>0).length);
    if(settings.data)setBrand((prev:any)=>({...prev,...settings.data}));
  });
 },[]);
 async function uploadLogo(file:File){
  const allowed=['image/png','image/jpeg','image/webp','image/svg+xml'];
  if(!allowed.includes(file.type)){alert('Please upload PNG, JPG, WEBP or SVG.');return}
  if(file.size>2*1024*1024){alert('Logo must be under 2 MB.');return}
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  setUploading(true);
  const ext=(file.name.split('.').pop()||'png').toLowerCase();
  const path=user.id+'/logo.'+ext;
  const up=await supabase.storage.from('branding').upload(path,file,{upsert:true,contentType:file.type||'image/png',cacheControl:'3600'});
  if(up.error){setUploading(false);alert(up.error.message);return}
  const publicUrl=supabase.storage.from('branding').getPublicUrl(path).data.publicUrl+'?v='+Date.now();
  const save=await supabase.from('business_settings').upsert({user_id:user.id,logo_url:publicUrl.split('?')[0],updated_at:new Date().toISOString()});
  setUploading(false);
  if(save.error){alert(save.error.message);return}
  setBrand((x:any)=>({...x,logo_url:publicUrl}));
 }
 async function saveBranding(e:React.FormEvent){
  e.preventDefault();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  setSavingBrand(true);
  const payload={
   user_id:user.id,
   company_name:brand.company_name,
   tagline:brand.tagline||null,
   address:brand.address||null,
   phone:brand.phone||null,
   email:brand.email||null,
   website:brand.website||null,
   footer_text:brand.footer_text||null,
   pdf_template:brand.pdf_template,
   show_logo:!!brand.show_logo,
   primary_color:brand.primary_color||'#0f172a',
   accent_color:brand.accent_color||'#f7941d',
   updated_at:new Date().toISOString()
  };
  const {error}=await supabase.from('business_settings').upsert(payload);
  setSavingBrand(false);
  if(error){alert(error.message);return}
  alert('PDF branding saved successfully.');
 }
 function setField(key:string,value:string|boolean){setBrand((x:any)=>({...x,[key]:value}))}
 const due=totalDue;
 const templates=[
  {key:'travel',name:'Travel Premium',desc:'Travel illustration, blue-orange premium header',icon:'✈️'},
  {key:'classic',name:'Classic Corporate',desc:'Formal navy corporate invoice style',icon:'▣'},
  {key:'modern',name:'Modern Clean',desc:'Minimal modern business document',icon:'◈'},
  {key:'minimal',name:'Minimal',desc:'Very clean paper-style layout',icon:'—'}
 ];
 return <>
  <div className='mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end'><div><p className='text-sm font-bold text-brand-blue'>Bangladesh Tours & Travels</p><h1 className='mt-1 text-3xl font-black tracking-tight'>Bill Book Dashboard</h1><p className='mt-2 text-sm text-slate-500'>Bookings, payments and customer dues — kept simple.</p></div></div>
  <div className='grid gap-4 md:grid-cols-3'><Stat icon={<WalletCards/>} title='Outstanding Due' value={'₹ '+due.toLocaleString('en-IN')} accent='orange'/><Stat icon={<Users/>} title='Customers with Due' value={String(customerDueCount)} accent='blue'/><Stat icon={<FilePlus2/>} title='Quick Start' value='New Bill' accent='blue'/></div>

  <div className='card mt-6 p-4 sm:p-5'>
   <div className='mb-5'><h2 className='font-black'>PDF Template & Business Branding</h2><p className='mt-1 text-xs leading-5 text-slate-400'>Choose a ready template, then set your own logo, company name, address and contact details. These settings appear on new bills and receipts.</p></div>

   <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
    {templates.map(t=><button key={t.key} type='button' onClick={()=>setField('pdf_template',t.key)} className={'rounded-2xl border p-4 text-left transition '+(brand.pdf_template===t.key?'border-brand-blue bg-brand-blue/5 ring-2 ring-brand-blue/10':'border-slate-200 bg-white hover:bg-slate-50')}>
      <div className='text-2xl'>{t.icon}</div><div className='mt-3 font-black text-sm'>{t.name}</div><div className='mt-1 text-[11px] leading-4 text-slate-400'>{t.desc}</div>{brand.pdf_template===t.key&&<div className='mt-3 text-[10px] font-black uppercase tracking-widest text-brand-blue'>Selected</div>}
    </button>)}
   </div>

   <form onSubmit={saveBranding} className='mt-6 grid gap-5 lg:grid-cols-[1fr_260px]'>
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
       <div><label className='label'>Company name</label><input className='field' value={brand.company_name||''} onChange={e=>setField('company_name',e.target.value)} /></div>
       <div><label className='label'>Tagline</label><input className='field' value={brand.tagline||''} onChange={e=>setField('tagline',e.target.value)} placeholder='Your Trusted Travel Partner' /></div>
       <div className='sm:col-span-2'><label className='label'>Business address</label><textarea className='field min-h-20' value={brand.address||''} onChange={e=>setField('address',e.target.value)} placeholder='Full office address' /></div>
       <div><label className='label'>Phone</label><input className='field' value={brand.phone||''} onChange={e=>setField('phone',e.target.value)} placeholder='+880...' /></div>
       <div><label className='label'>Email</label><input className='field' type='email' value={brand.email||''} onChange={e=>setField('email',e.target.value)} placeholder='info@example.com' /></div>
       <div><label className='label'>Website</label><input className='field' value={brand.website||''} onChange={e=>setField('website',e.target.value)} placeholder='www.example.com' /></div>
       <div><label className='label'>Footer text</label><input className='field' value={brand.footer_text||''} onChange={e=>setField('footer_text',e.target.value)} placeholder='Professional Travel Services' /></div>
       <div><label className='label'>Primary color</label><div className='flex gap-3'><input type='color' value={brand.primary_color||'#0f172a'} onChange={e=>setField('primary_color',e.target.value)} className='h-12 w-14 rounded-xl border border-slate-200 bg-white p-1'/><input className='field' value={brand.primary_color||'#0f172a'} onChange={e=>setField('primary_color',e.target.value)} /></div></div>
       <div><label className='label'>Accent color</label><div className='flex gap-3'><input type='color' value={brand.accent_color||'#f7941d'} onChange={e=>setField('accent_color',e.target.value)} className='h-12 w-14 rounded-xl border border-slate-200 bg-white p-1'/><input className='field' value={brand.accent_color||'#f7941d'} onChange={e=>setField('accent_color',e.target.value)} /></div></div>
      </div>
      <label className='flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700'>
       <input type='checkbox' checked={brand.show_logo!==false} onChange={e=>setField('show_logo',e.target.checked)} className='h-4 w-4'/> Show logo on PDF
      </label>
      <button className='btn btn-primary w-full sm:w-auto' disabled={savingBrand}>{savingBrand?'Saving...':'Save PDF Branding'}</button>
    </div>

    <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
      <p className='text-xs font-black uppercase tracking-widest text-brand-blue'>Logo</p>
      <div className='mt-3 grid h-40 place-items-center rounded-xl border border-slate-200 bg-white p-3'>
       {brand.logo_url?<img src={brand.logo_url} alt='Business logo' className='max-h-28 max-w-full object-contain'/>:<span className='text-xs text-slate-400'>No logo uploaded</span>}
      </div>
      <label className='btn btn-secondary mt-3 w-full cursor-pointer'>{uploading?'Uploading...':'Upload / Replace Logo'}<input type='file' className='hidden' accept='image/png,image/jpeg,image/webp,image/svg+xml' disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)uploadLogo(file);e.currentTarget.value=''}}/></label>
      <p className='mt-2 text-[11px] leading-4 text-slate-400'>PNG, JPG, WEBP or SVG. Maximum 2 MB.</p>
    </div>
   </form>
  </div>

  <div className='card mt-6 overflow-hidden'><div className='border-b border-slate-100 p-5'><h2 className='font-black'>Outstanding Customers</h2><p className='mt-1 text-xs text-slate-400'>Highest due balances first.</p></div>{rows.length===0?<div className='p-8 text-sm text-slate-400'>No customer balances yet. Add a customer to start.</div>:<div className='divide-y divide-slate-100'>{rows.map(r=><div key={r.id} className='flex items-center justify-between gap-3 p-4 sm:p-5'><div className='min-w-0'><p className='truncate font-bold'>{r.name}</p><p className='mt-1 truncate text-xs text-slate-400'>{r.phone||'No mobile'}</p></div><b className='shrink-0 text-brand-orange'>₹ {Number(r.current_due).toLocaleString('en-IN')}</b></div>)}</div>}</div>
 </>;
}
function Stat({icon,title,value,accent}:{icon:React.ReactNode;title:string;value:string;accent:string}){return <div className='card p-5'><div className='flex items-center justify-between'><span className='text-sm font-semibold text-slate-500'>{title}</span><span className={accent==='orange'?'text-brand-orange':'text-brand-blue'}>{icon}</span></div><div className='mt-4 text-3xl font-black'>{value}</div></div>}

function Customers() {
  const [rows,setRows] = useState<Customer[]>([]);
  const [q,setQ] = useState('');
  const [show,setShow] = useState(false);
  const [editing,setEditing] = useState<Customer|null>(null);
  const [ledger,setLedger] = useState<string|null>(null);
  const [name,setName] = useState('');
  const [phone,setPhone] = useState('');
  const [address,setAddress] = useState('');
  const [openingDue,setOpeningDue] = useState('0');
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState<string|null>(null);
  const [balancesReady,setBalancesReady] = useState(false);
  const [notice,setNotice] = useState<string|null>(null);
  const [saving,setSaving] = useState(false);
  const [deletingId,setDeletingId] = useState<string|null>(null);
  const [showArchived,setShowArchived] = useState(false);

  async function load(includeArchived = showArchived) {
    setLoading(true);
    const result = await fetchCustomerRecords(includeArchived);
    setRows(result.rows);
    setLoadError(result.error);
    setBalancesReady(result.balancesReady);
    setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  function resetForm() { setName('');setPhone('');setAddress('');setOpeningDue('0');setShow(false);setEditing(null); }
  function openEdit(r:Customer) { setEditing(r);setName(r.name);setPhone(r.phone||'');setAddress(r.address||'');setOpeningDue(String(r.opening_due??0));setShow(true); }

  async function save(e:React.FormEvent) {
    e.preventDefault();
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) { alert('Please sign in again.'); return; }
    setSaving(true);
    const payload = {name:name.trim(),phone:phone.trim()||null,address:address.trim()||null,opening_due:Number(openingDue)||0};
    const r = editing
      ? await supabase.from('customers').update(payload).eq('id',editing.id).eq('user_id',user.id)
      : await supabase.from('customers').insert({user_id:user.id,...payload});
    setSaving(false);
    if(r.error) { alert('Customer could not be saved: '+r.error.message); return; }
    setNotice(editing?'Customer details updated.':'Customer added successfully.');
    resetForm();
    await load();
  }

  async function setCustomerArchived(customer:Customer, archived:boolean) {
    if(deletingId) return;
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) { alert('Please sign in again before changing customer status.'); return; }
    setDeletingId(customer.id);
    setNotice(null);
    const {data,error} = await supabase.from('customers')
      .update({is_archived:archived})
      .eq('id',customer.id).eq('user_id',user.id)
      .select('id,is_archived');
    setDeletingId(null);
    if(error) {
      alert('Customer status could not be changed. Apply the customer archive database migration first. '+error.message);
      return;
    }
    if(!data?.length) {
      alert('No change was saved. Please check the admin UPDATE policy for customers.');
      return;
    }
    setNotice(archived
      ? customer.name+' was archived. Their bills and payments remain in the ledger.'
      : customer.name+' was restored to active customers.');
    await load(showArchived);
  }

  async function removeCustomer(customer:Customer) {
    if(deletingId) return;
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) { alert('Please sign in again before removing a customer.'); return; }
    setDeletingId(customer.id);
    setNotice(null);

    const [billCheck,paymentCheck] = await Promise.all([
      supabase.from('bills').select('id',{count:'exact',head:true}).eq('customer_id',customer.id),
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('customer_id',customer.id),
    ]);
    if(billCheck.error||paymentCheck.error) {
      setDeletingId(null);
      alert('Could not verify this customer’s history. Nothing was removed. '+(billCheck.error?.message||paymentCheck.error?.message||''));
      return;
    }

    const billCount=billCheck.count||0;
    const paymentCount=paymentCheck.count||0;
    if(billCount>0||paymentCount>0) {
      setDeletingId(null);
      if(confirm(customer.name+' has '+billCount+' bill(s) and '+paymentCount+' payment(s). To protect accounting history, archive this customer instead? Existing bills and statements will remain available, but the customer will no longer appear when creating new bills or payments.')) {
        await setCustomerArchived(customer,true);
      }
      return;
    }

    if(!confirm('Permanently delete '+customer.name+'? This customer has no recorded bills or payments.')) {
      setDeletingId(null);
      return;
    }
    const {data,error}=await supabase.from('customers').delete()
      .eq('id',customer.id).eq('user_id',user.id).select('id');
    if(error) {
      setDeletingId(null);
      if(confirm('The database blocked permanent deletion. Archive this customer instead so they are removed from active dropdowns?')) {
        await setCustomerArchived(customer,true);
      } else {
        alert('Delete failed: '+error.message);
      }
      return;
    }
    setDeletingId(null);
    if(!data?.length) {
      alert('No customer was deleted. Please verify the customers DELETE policy in Supabase.');
      return;
    }
    setNotice(customer.name+' was permanently deleted.');
    await load(showArchived);
  }

  const list = rows.filter(r=>(r.name+' '+(r.phone||'')).toLowerCase().includes(q.toLowerCase()));

  return <>
    <Head title='Customers' sub='Manage customer profiles, contact details and balances.' action={<button type='button' className='btn btn-primary w-full md:w-auto' onClick={()=>{setEditing(null);setName('');setPhone('');setAddress('');setOpeningDue('0');setShow(true)}}><Plus size={18}/> New Customer</button>}/>

    {notice&&<div role='status' className='mt-5 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800'><span>{notice}</span><button type='button' onClick={()=>setNotice(null)} className='shrink-0 rounded-lg px-2 py-1 text-emerald-700 hover:bg-emerald-100' aria-label='Dismiss message'><X size={16}/></button></div>}
    {loadError&&<div role='alert' className='mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900'><span className='font-bold'>Attention:</span><span className='min-w-0 break-words'>{loadError}</span></div>}

    <section className='card mt-6 overflow-hidden'>
      <div className='flex flex-col gap-4 border-b border-slate-100 bg-white p-4 sm:p-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div><h2 className='font-black text-slate-900'>{showArchived?'All customers':'Customer directory'}</h2><p className='mt-1 text-xs text-slate-500'>{loading?'Loading records…':list.length+' shown · '+rows.length+' total'+(showArchived?' including archived':' active')}</p></div>
          <button type='button' className='btn btn-secondary w-full sm:w-auto' onClick={()=>{const next=!showArchived;setShowArchived(next);void load(next)}}>{showArchived?<RotateCcw size={16}/>:<Archive size={16}/>} {showArchived?'Hide archived':'Show archived'}</button>
        </div>
        <div className='relative w-full'><Search className='pointer-events-none absolute left-3 top-3.5 text-slate-400' size={18}/><input className='field pl-10' aria-label='Search customer or mobile' placeholder='Search name, mobile or address…' value={q} onChange={e=>setQ(e.target.value)}/></div>
      </div>

      {loading?<div className='p-10 text-center'><div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-blue'/><p className='mt-3 text-sm text-slate-500'>Loading customer records…</p></div>
      :<div className='divide-y divide-slate-100'>
        {list.map(r=><article key={r.id} className='grid gap-3 p-4 transition-colors hover:bg-slate-50/80 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-5'>
          <button type='button' onClick={()=>setLedger(r.id)} className='flex min-w-0 items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue'>
            <span className='grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sm font-black uppercase text-brand-blue'>{(r.name||'C').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span>
            <span className='min-w-0 flex-1'><span className='flex flex-wrap items-center gap-2 font-bold text-slate-900'><span className='break-words'>{r.name}</span>{r.is_archived&&<span className='rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500'>Archived</span>}</span><span className='mt-1 block break-words text-xs text-slate-500'>{r.phone||'No mobile number'}{r.address?' · '+r.address:''}</span></span>
          </button>
          <div className='flex flex-wrap items-center justify-between gap-3 sm:justify-end'>
            <div className='min-w-[112px] sm:text-right'><p className='text-[10px] font-black uppercase tracking-wider text-slate-400'>Current due</p><p className={'mt-1 text-base font-black '+(Number(r.current_due)>0?'text-brand-orange':'text-emerald-600')}>{balancesReady?'₹ '+Number(r.current_due).toLocaleString('en-IN'):'—'}</p></div>
            <div className='flex flex-1 items-center justify-end gap-2 sm:flex-none'>
              <button type='button' onClick={()=>openEdit(r)} className='inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-brand-blue sm:flex-none'><Save size={14}/> Edit</button>
              {r.is_archived
                ? <button type='button' disabled={deletingId!==null} onClick={()=>void setCustomerArchived(r,false)} className='inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 sm:flex-none'>{deletingId===r.id?<span className='h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600'/>:<RotateCcw size={14}/>} {deletingId===r.id?'Working…':'Restore'}</button>
                : <button type='button' disabled={deletingId!==null} onClick={()=>void removeCustomer(r)} className='inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50 sm:flex-none'>{deletingId===r.id?<span className='h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600'/>:<Trash2 size={14}/>} {deletingId===r.id?'Working…':'Remove'}</button>}
            </div>
          </div>
        </article>)}
        {!list.length&&<div className='p-10 text-center'><div className='mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500'><Users size={22}/></div><p className='mt-3 font-bold text-slate-800'>{q?'No matching customers':'No customers yet'}</p><p className='mt-1 text-sm text-slate-500'>{q?'Try a different name or mobile number.':'Add your first customer to start billing.'}</p></div>}
      </div>}
      <div className='flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between'><span>Open a customer to view their ledger. Customers with billing history are archived, not erased.</span><button type='button' onClick={()=>void load(showArchived)} className='inline-flex min-h-10 items-center justify-center rounded-lg px-3 font-bold text-brand-blue hover:bg-white'>Refresh list</button></div>
    </section>

    {show&&<Modal title={editing?'Edit Customer':'New Customer'} close={resetForm}><form onSubmit={save} className='space-y-4'>
      <div><label className='label'>Customer name</label><input className='field' value={name} onChange={e=>setName(e.target.value)} required autoComplete='name'/></div>
      <div><label className='label'>Mobile</label><input className='field' inputMode='tel' autoComplete='tel' value={phone} onChange={e=>setPhone(e.target.value)}/></div>
      <div><label className='label'>Address</label><textarea className='field min-h-24' value={address} onChange={e=>setAddress(e.target.value)}/></div>
      <div><label className='label'>Opening / Previous Due</label><input className='field' type='number' min='0' value={openingDue} onChange={e=>setOpeningDue(e.target.value)} placeholder='10000'/><p className='mt-1 text-xs leading-5 text-slate-500'>Only enter a previous balance if this customer already owed money before using this app.</p></div>
      <button className='btn btn-primary w-full' disabled={saving}>{saving?'Saving…':'Save Customer'}</button>
    </form></Modal>}
    {ledger&&<CustomerLedger customerId={ledger} onClose={()=>setLedger(null)}/>}
  </>;
}

function Head({title,sub,action}:{title:string;sub:string;action?:React.ReactNode}){return <div className='flex flex-col justify-between gap-4 md:flex-row md:items-end'><div className='min-w-0'><p className='text-xs font-bold text-brand-blue sm:text-sm'>Bangladesh Tours & Travels</p><h1 className='mt-1 text-2xl font-black tracking-tight sm:text-3xl'>{title}</h1><p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>{sub}</p></div>{action&&<div className='w-full md:w-auto md:shrink-0'>{action}</div>}</div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) {
  return <div className='fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4'>
    <div className='card max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6'>
      <div className='flex items-center justify-between gap-3'><h2 className='text-xl font-black'>{title}</h2><button type='button' onClick={close} className='grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100' aria-label='Close dialog'><X size={20}/></button></div>
      <div className='mt-5'>{children}</div>
    </div>
  </div>;
}

function CustomerPicker({customers,value,onChange,placeholder}:{customers:Customer[];value:string;onChange:(value:string)=>void;placeholder:string}) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const selected=customers.find(customer=>customer.id===value);
  const filtered=customers.filter(customer=>(customer.name+' '+(customer.phone||'')+' '+(customer.address||'')).toLowerCase().includes(search.trim().toLowerCase()));
  function choose(customer:Customer) { onChange(customer.id); setSearch(''); setOpen(false); }
  return <div className='relative'>
    <button type='button' className={'field flex min-h-12 items-center justify-between gap-3 text-left '+(open?'border-brand-blue ring-2 ring-sky-100':'')} aria-haspopup='listbox' aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className='flex min-w-0 items-center gap-3'><span className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-brand-blue'><UserRound size={17}/></span><span className='min-w-0'><span className={'block truncate text-sm '+(selected?'font-bold text-slate-900':'font-medium text-slate-400')}>{selected?.name||placeholder}</span><span className='mt-0.5 block truncate text-xs text-slate-500'>{selected ? (selected.phone||'No mobile number') : customers.length+' active customers available'}</span></span></span>
      <ChevronDown size={18} className={'shrink-0 text-slate-400 transition-transform '+(open?'rotate-180':'')}/>
    </button>
    {open&&<div className='absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15'>
      <div className='border-b border-slate-100 bg-slate-50 p-3'><div className='relative'><Search size={17} className='pointer-events-none absolute left-3 top-3.5 text-slate-400'/><input autoFocus className='field bg-white pl-10' aria-label='Search customers' placeholder='Type customer name or mobile…' value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setOpen(false)}}/></div><p className='mt-2 px-1 text-[11px] font-semibold text-slate-500'>Showing {filtered.length} of {customers.length} customers</p></div>
      <div role='listbox' className='max-h-[min(48dvh,22rem)] overflow-y-auto overscroll-contain p-1.5'>
        {filtered.map(customer=><button type='button' role='option' aria-selected={customer.id===value} key={customer.id} onClick={()=>choose(customer)} className={'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition '+(customer.id===value?'bg-sky-50':'hover:bg-slate-50')}>
          <span className='flex min-w-0 items-center gap-2.5'><span className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black uppercase text-slate-600'>{(customer.name||'C').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span><span className='min-w-0'><span className='block break-words text-sm font-bold text-slate-900'>{customer.name}</span><span className='mt-0.5 block truncate text-xs text-slate-500'>{customer.phone||'No mobile number'}</span></span></span>
          <span className='flex shrink-0 items-center gap-2'>{Number.isFinite(Number(customer.current_due))&&<span className={'text-xs font-bold '+(Number(customer.current_due)>0?'text-brand-orange':'text-slate-400')}>₹ {Number(customer.current_due).toLocaleString('en-IN')}</span>}{customer.id===value&&<Check size={17} className='text-brand-blue'/>}</span>
        </button>)}
        {!filtered.length&&<div className='px-4 py-8 text-center'><Search size={22} className='mx-auto text-slate-300'/><p className='mt-2 text-sm font-bold text-slate-700'>No matching customer</p><p className='mt-1 text-xs text-slate-500'>Try another spelling or mobile number.</p></div>}
      </div>
    </div>}
  </div>;
}

function NewBill({onDone}:{onDone:()=>void}){const [customers,setCustomers]=useState<Customer[]>([]);const [customerId,setCustomerId]=useState('');const [items,setItems]=useState<Item[]>([{passenger_name:'',travel_date:'',service_type:'Flight Ticket',details:'',amount:''}]);const [paid,setPaid]=useState('0');const [method,setMethod]=useState('Cash');const [saving,setSaving]=useState(false);const [done,setDone]=useState<any>(null);const [customerError,setCustomerError]=useState<string|null>(null);const [balancesReady,setBalancesReady]=useState(false);useEffect(()=>{let active=true;(async()=>{const result=await fetchCustomerRecords();if(!active)return;setCustomers(result.rows);setCustomerError(result.error);setBalancesReady(result.balancesReady)})();return()=>{active=false}},[]);const c=customers.find(x=>x.id===customerId);const subtotal=useMemo(()=>items.reduce((s,i)=>s+(Number(i.amount)||0),0),[items]);const total=Math.max(Number(c?.current_due||0)+subtotal-(Number(paid)||0),0);function upd(i:number,k:keyof Item,v:string){setItems(a=>a.map((x,n)=>n===i?{...x,[k]:v}:x))}async function save(){if(!customerId||subtotal<=0||!balancesReady||saving)return;setSaving(true);const {data,error}=await supabase.rpc('create_bill',{p_customer_id:customerId,p_bill_date:new Date().toISOString().slice(0,10),p_items:items.map(x=>({...x,amount:Number(x.amount)})),p_paid_now:Number(paid)||0,p_payment_method:method,p_notes:null});setSaving(false);if(error){alert(error.message);return}setDone(data);onDone()}if(done)return <div className='card mx-auto max-w-xl p-8 text-center'><div className='mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600'>✓</div><h1 className='mt-5 text-2xl font-black'>Bill saved</h1><p className='mt-2 text-slate-500'>Bill <b>{done.bill_no}</b> created successfully.</p><div className='mt-6 grid grid-cols-2 gap-3 text-left'><div className='rounded-xl bg-slate-50 p-4'><p className='text-xs text-slate-400'>Today's Bill</p><p className='mt-1 text-xl font-black'>₹ {subtotal.toLocaleString('en-IN')}</p></div><div className='rounded-xl bg-orange-50 p-4'><p className='text-xs text-slate-400'>Remaining Due</p><p className='mt-1 text-xl font-black text-brand-orange'>₹ {Number(done.total_due).toLocaleString('en-IN')}</p></div></div><div className='mt-6'><BillPdfActions data={{billNo:done.bill_no,billDate:new Date().toISOString().slice(0,10),customerName:c?.name||'Customer',customerPhone:c?.phone,customerAddress:c?.address,previousDue:Number(done.previous_due||0),subtotal:Number(done.subtotal||subtotal),paidNow:Number(done.paid_now||paid||0),totalDue:Number(done.total_due||0),items:items.map(x=>({...x,amount:Number(x.amount||0)}))}}/></div><button onClick={()=>setDone(null)} className='btn btn-primary mt-4'>Create another bill</button></div>;return <><Head title='New Bill' sub='Add passengers and ticket amounts. Previous due is automatic.'/><div className='mt-6 grid gap-6 xl:grid-cols-[1fr_360px]'><div className='space-y-5'><div className='card p-5'><label className='label'>Customer</label><CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} placeholder='Select customer'/>{customerError&&<div role='alert' className='mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900'>{customerError}</div>}{!customers.length&&!customerError&&<p className='mt-2 text-xs text-slate-500'>No customers available yet. Add a customer first.</p>}{c&&<div className='mt-3 rounded-xl bg-orange-50 p-4 text-sm'><span className='text-slate-500'>Previous due</span><strong className='float-right text-brand-orange'>₹ {Number(c.current_due).toLocaleString('en-IN')}</strong></div>}</div><div className='card p-5'><div className='mb-4 flex items-center justify-between'><h2 className='font-black'>Booking details</h2><button onClick={()=>setItems(a=>[...a,{passenger_name:'',travel_date:'',service_type:'Flight Ticket',details:'',amount:''}])} className='btn btn-secondary'><Plus size={16}/> Add passenger</button></div><div className='space-y-4'>{items.map((it,i)=><div key={i} className='rounded-2xl border border-slate-200 p-4'><div className='mb-4 flex items-center justify-between'><span className='text-xs font-black uppercase tracking-widest text-brand-blue'>Passenger {i+1}</span>{items.length>1&&<button onClick={()=>setItems(a=>a.filter((_,n)=>n!==i))} className='text-slate-400'><Trash2 size={16}/></button>}</div><div className='grid gap-3 md:grid-cols-2'><div><label className='label'>Passenger name</label><input className='field' value={it.passenger_name} onChange={e=>upd(i,'passenger_name',e.target.value)} placeholder='Asim'/></div><div><label className='label'>Flight date</label><input className='field' type='date' value={it.travel_date} onChange={e=>upd(i,'travel_date',e.target.value)}/></div><div><label className='label'>Service</label><select className='field' value={it.service_type} onChange={e=>upd(i,'service_type',e.target.value)}><option>Flight Ticket</option><option>Bus Ticket</option><option>Hotel Booking</option><option>Visa Processing</option><option>Tour Package</option><option>Other</option></select></div><div><label className='label'>Amount</label><input className='field' type='number' min='0' value={it.amount} onChange={e=>upd(i,'amount',e.target.value)} placeholder='5000'/></div><div className='md:col-span-2'><label className='label'>Details</label><input className='field' value={it.details} onChange={e=>upd(i,'details',e.target.value)} placeholder='Airline / route / PNR'/></div></div></div>)}</div></div></div><aside className='card h-fit p-5 xl:sticky xl:top-24'><h2 className='font-black'>Bill summary</h2><div className='mt-5 space-y-4 text-sm'><div className='flex justify-between'><span className='text-slate-500'>Previous Due</span><b>₹ {Number(c?.current_due||0).toLocaleString('en-IN')}</b></div><div className='flex justify-between'><span className='text-slate-500'>Today's Bill</span><b>₹ {subtotal.toLocaleString('en-IN')}</b></div><div><label className='label'>Payment now</label><input className='field' type='number' min='0' value={paid} onChange={e=>setPaid(e.target.value)}/></div>{Number(paid)>0&&<div><label className='label'>Payment method</label><select className='field' value={method} onChange={e=>setMethod(e.target.value)}><option>Cash</option><option>Bank</option><option>bKash</option><option>Nagad</option><option>Other</option></select></div>}<div className='rounded-2xl bg-brand-ink p-4 text-white'><div className='text-xs text-slate-300'>Remaining Due</div><div className='mt-1 text-3xl font-black'>₹ {total.toLocaleString('en-IN')}</div></div><button disabled={saving||!customerId||subtotal<=0||!balancesReady} onClick={save} className='btn btn-primary w-full'><Save size={17}/>{saving?'Saving…':!balancesReady?'Checking customer balances…':'Save Bill'}</button></div></aside></div></>}

function Payments(){const [customers,setCustomers]=useState<Customer[]>([]);const [id,setId]=useState('');const [amount,setAmount]=useState('');const [method,setMethod]=useState('Cash');const [note,setNote]=useState('');const [done,setDone]=useState<any>(null);const [customerError,setCustomerError]=useState<string|null>(null);const [balancesReady,setBalancesReady]=useState(false);const [saving,setSaving]=useState(false);async function load(){const result=await fetchCustomerRecords();setCustomers(result.rows);setCustomerError(result.error);setBalancesReady(result.balancesReady)}useEffect(()=>{void load()},[]);const c=customers.find(x=>x.id===id);async function save(e:React.FormEvent){e.preventDefault();if(!balancesReady||saving||!id)return;setSaving(true);const {data,error}=await supabase.rpc('record_payment',{p_customer_id:id,p_payment_date:new Date().toISOString().slice(0,10),p_amount:Number(amount),p_payment_method:method,p_notes:note||null});setSaving(false);if(error){alert(error.message);return}setDone(data);setAmount('');setNote('');void load()}if(done)return <div className='card mx-auto max-w-lg p-8 text-center'><WalletCards className='mx-auto text-brand-blue' size={40}/><h1 className='mt-4 text-2xl font-black'>Payment recorded</h1><p className='mt-2 text-slate-500'>{done.payment_no}</p><div className='mt-6 rounded-2xl bg-slate-50 p-5'><p className='text-xs text-slate-400'>Received</p><p className='mt-1 text-3xl font-black'>₹ {Number(done.paid).toLocaleString('en-IN')}</p><p className='mt-4 text-xs text-slate-400'>Remaining Due</p><p className='mt-1 text-2xl font-black text-brand-orange'>₹ {Number(done.remaining_due).toLocaleString('en-IN')}</p></div><div className='mt-6'><PaymentPdfActions data={{paymentNo:done.payment_no,paymentDate:new Date().toISOString().slice(0,10),customerName:c?.name||'Customer',customerPhone:c?.phone,amount:Number(done.paid||amount||0),method,previousDue:Number(done.previous_due||0),remainingDue:Number(done.remaining_due||0),note:note||null}}/></div><button onClick={()=>setDone(null)} className='btn btn-primary mt-4'>Record another payment</button></div>;return <><Head title='Add Payment' sub='Record a payment and update the running due instantly.'/><form onSubmit={save} className='card mt-6 max-w-xl space-y-5 p-6'><div><label className='label'>Customer</label><CustomerPicker customers={customers} value={id} onChange={setId} placeholder='Select customer for payment'/>{customerError&&<div role='alert' className='mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900'>{customerError}</div>}</div>{c&&<div className='rounded-2xl bg-orange-50 p-4'><span className='text-sm text-slate-500'>Current due</span><b className='float-right text-lg text-brand-orange'>₹ {Number(c.current_due).toLocaleString('en-IN')}</b></div>}<div><label className='label'>Payment amount</label><input className='field' type='number' min='1' max={c?.current_due||undefined} value={amount} onChange={e=>setAmount(e.target.value)} required/>{c&&<div className='mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4'><div className='flex justify-between text-sm'><span className='text-slate-500'>Current Due</span><b>₹ {Number(c.current_due).toLocaleString('en-IN')}</b></div><div className='mt-2 flex justify-between text-sm'><span className='text-slate-500'>Payment</span><b className='text-emerald-600'>− ₹ {Number(amount||0).toLocaleString('en-IN')}</b></div><div className='my-3 border-t border-slate-200'></div><div className='flex justify-between'><span className='font-bold'>Remaining Due</span><b className='text-lg text-brand-orange'>₹ {Math.max(Number(c.current_due||0)-Number(amount||0),0).toLocaleString('en-IN')}</b></div></div>}</div><div><label className='label'>Method</label><select className='field' value={method} onChange={e=>setMethod(e.target.value)}><option>Cash</option><option>Bank</option><option>bKash</option><option>Nagad</option><option>Other</option></select></div><div><label className='label'>Note</label><textarea className='field min-h-24' value={note} onChange={e=>setNote(e.target.value)}/></div><button className='btn btn-primary w-full' disabled={saving||!id||!balancesReady||Number(amount)<=0}>{saving?'Saving…':!balancesReady?'Checking customer balances…':'Save Payment'}</button></form></>}

function Bills(){
 const [rows,setRows]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [q,setQ]=useState('');
 const [page,setPage]=useState(1);
 const [total,setTotal]=useState(0);
 const SIZE=20;

 async function load(nextPage=page,query=q){
  setLoading(true);
  const start=(nextPage-1)*SIZE;
  let base:any[]=[];
  let count=0;
  if(query.trim()){
   const term=query.trim();
   const [bn,cn]=await Promise.all([
    supabase.from('bills').select('id,bill_no,bill_date,subtotal,previous_due,paid_now,total_due,created_at,customer_id,customers(name,phone,address)').ilike('bill_no','%'+term+'%').order('created_at',{ascending:false}).limit(100),
    supabase.from('customers').select('id').ilike('name','%'+term+'%').limit(100)
   ]);
   if(bn.error||cn.error){alert(bn.error?.message||cn.error?.message||'Search failed.');setRows([]);setTotal(0);setLoading(false);return}
   let cb:any[]=[];
   const ids=(cn.data||[]).map((x:any)=>x.id);
   if(ids.length){
    const z=await supabase.from('bills').select('id,bill_no,bill_date,subtotal,previous_due,paid_now,total_due,created_at,customer_id,customers(name,phone,address)').in('customer_id',ids).order('created_at',{ascending:false}).limit(100);
    if(z.error){alert(z.error.message);setRows([]);setTotal(0);setLoading(false);return}
    cb=z.data||[];
   }
   const map=new Map<string,any>();
   [...(bn.data||[]),...cb].forEach((x:any)=>map.set(x.id,x));
   const all=Array.from(map.values()).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
   count=all.length;
   base=all.slice(start,start+SIZE);
  }else{
   const z=await supabase.from('bills').select('id,bill_no,bill_date,subtotal,previous_due,paid_now,total_due,created_at,customers(name,phone,address)',{count:'exact'}).order('created_at',{ascending:false}).range(start,start+SIZE-1);
   if(z.error){alert(z.error.message);setRows([]);setTotal(0);setLoading(false);return}
   base=z.data||[];count=z.count||0;
  }
  const ids=base.map((x:any)=>x.id);
  let items:any[]=[];
  if(ids.length){
   const z=await supabase.from('bill_items').select('bill_id,passenger_name,travel_date,service_type,details,amount').in('bill_id',ids).order('created_at',{ascending:true});
   if(z.error){alert(z.error.message);setRows([]);setTotal(0);setLoading(false);return}
   items=z.data||[];
  }
  const map=new Map<string,any[]>();
  items.forEach((x:any)=>{const a=map.get(x.bill_id)||[];a.push(x);map.set(x.bill_id,a)});
  setRows(base.map((x:any)=>({...x,items:map.get(x.id)||[]})));
  setTotal(count);setLoading(false);
 }

 useEffect(()=>{void load(1,'')},[]);
 const pages=Math.max(1,Math.ceil(total/SIZE));

 return <><Head title='Bills' sub='Every booking bill stays in one place.'/><div className='card mt-6 p-4'><form onSubmit={e=>{e.preventDefault();setPage(1);void load(1,q)}} className='flex flex-col gap-3 sm:flex-row'><input className='field flex-1' placeholder='Search bill number or customer name...' value={q} onChange={e=>setQ(e.target.value)}/><div className='flex gap-2'><button className='btn btn-primary'>Search</button>{q&&<button type='button' className='btn btn-secondary' onClick={()=>{setQ('');setPage(1);void load(1,'')}}>Clear</button>}</div></form></div><div className='card mt-4 overflow-hidden'>{loading?<div className='p-10 text-center text-sm text-slate-400'>Loading bills...</div>:<div className='divide-y divide-slate-100'>{rows.map((r,index)=>{const customer=r.customers||{};const pdfData={billNo:r.bill_no,billDate:r.bill_date,customerName:customer.name||'Customer',customerPhone:customer.phone||null,customerAddress:customer.address||null,previousDue:Number(r.previous_due||0),subtotal:Number(r.subtotal||0),paidNow:Number(r.paid_now||0),totalDue:Number(r.total_due||0),items:(r.items||[]).map((item:any)=>({passenger_name:item.passenger_name||'Passenger',travel_date:item.travel_date||null,service_type:item.service_type||null,details:item.details||null,amount:Number(item.amount||0)}))};return <div key={r.id} className='flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between'><div className='min-w-0 flex-1'><div className='flex flex-wrap items-center gap-2'><p className='font-bold'>{customer.name||'Customer'}</p>{!q&&page===1&&index===0&&<span className='rounded-full bg-brand-orange/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-brand-orange'>Latest</span>}</div><p className='mt-1 text-xs text-slate-400'>{r.bill_no} · {new Date(r.bill_date).toLocaleDateString('en-GB')}</p></div><div className='flex flex-col items-stretch gap-3 md:items-end'><div className='grid grid-cols-3 gap-4 text-right text-sm'><div><p className='text-xs text-slate-400'>Bill</p><b>₹ {Number(r.subtotal).toLocaleString('en-IN')}</b></div><div><p className='text-xs text-slate-400'>Paid</p><b className='text-emerald-600'>₹ {Number(r.paid_now).toLocaleString('en-IN')}</b></div><div><p className='text-xs text-slate-400'>Due</p><b className='text-brand-orange'>₹ {Number(r.total_due).toLocaleString('en-IN')}</b></div></div><BillHistoryPdfActions data={pdfData}/></div></div>})}{!rows.length&&<div className='p-10 text-center text-sm text-slate-400'>{q?'No matching bills found.':'No bills yet.'}</div>}</div>}</div>{total>0&&<div className='mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row'><p className='text-xs text-slate-400'>Page {page} of {pages} · {total} bills</p><div className='flex w-full gap-2 sm:w-auto'><button type='button' disabled={page<=1||loading} onClick={()=>{const n=page-1;setPage(n);void load(n,q)}} className='btn btn-secondary flex-1 sm:flex-none'>Previous</button><button type='button' disabled={page>=pages||loading} onClick={()=>{const n=page+1;setPage(n);void load(n,q)}} className='btn btn-secondary flex-1 sm:flex-none'>Next</button></div></div>}</>;
}