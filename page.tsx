'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

type Customer = { id: string; customer_code: string; full_name: string; phone: string | null; address: string | null; plan_name: string; monthly_price: number; connection_status: 'active' | 'offline' | 'suspended'; is_active: boolean };
type Invoice = { id: string; customer_id: string; period: string; amount: number; due_date: string; status: 'unpaid' | 'partial' | 'paid' | 'void'; customers?: { full_name: string; customer_code: string } | null };
type Payment = { id: string; invoice_id: string; amount: number; paid_at: string; method: string; reference: string | null };
const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

export default function Home() {
  const [tab, setTab] = useState<'dashboard'|'customers'|'invoices'|'reports'>('dashboard');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [plan, setPlan] = useState('10 Mbps'); const [price, setPrice] = useState('150000');
  const [search, setSearch] = useState('');
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null); const [payAmount, setPayAmount] = useState(''); const [payMethod, setPayMethod] = useState('transfer');
  const supabase = useMemo(() => { try { return createClient(); } catch { return null; } }, []);

  async function load() {
    if (!supabase) { setLoading(false); setError('Hubungkan Supabase terlebih dahulu dengan mengisi .env.local. Lihat README.md.'); return; }
    setLoading(true); setError('');
    const [c, i, p] = await Promise.all([
      supabase.from('customers').select('id,customer_code,full_name,phone,address,plan_name,monthly_price,connection_status,is_active').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id,customer_id,period,amount,due_date,status,customers(full_name,customer_code)').order('due_date', { ascending: false }),
      supabase.from('payments').select('id,invoice_id,amount,paid_at,method,reference').order('paid_at', { ascending: false })
    ]);
    const issue = c.error || i.error || p.error;
    if (issue) setError(issue.message);
    setCustomers((c.data || []) as Customer[]); setInvoices((i.data || []) as unknown as Invoice[]); setPayments((p.data || []) as Payment[]); setLoading(false);
  }
  useEffect(() => {
    if (!supabase) { setLoading(false); setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setLoggedIn(Boolean(data.session)); setAuthReady(true); if (data.session) void load(); else setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setLoggedIn(Boolean(session)); if (session) void load(); else { setCustomers([]); setInvoices([]); setPayments([]); setLoading(false); } });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const active = customers.filter(c => c.connection_status === 'active' && c.is_active).length;
  const offline = customers.filter(c => c.connection_status === 'offline' && c.is_active).length;
  const month = new Date().toISOString().slice(0,7);
  const monthPayments = payments.filter(p => p.paid_at.slice(0,7) === month).reduce((sum,p) => sum + Number(p.amount), 0);
  const dueTotal = invoices.filter(i => i.status === 'unpaid' || i.status === 'partial').reduce((sum,i) => sum + Math.max(0, Number(i.amount) - payments.filter(p => p.invoice_id === i.id).reduce((a,p)=>a+Number(p.amount),0)), 0);
  const filteredCustomers = customers.filter(c => `${c.full_name} ${c.customer_code} ${c.phone || ''}`.toLowerCase().includes(search.toLowerCase()));

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return; setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setError(error.message); else { setNotice('Berhasil login.'); setLoginPassword(''); }
  }
  async function logout() { if (supabase) await supabase.auth.signOut(); setNotice('Kamu sudah logout.'); }

  async function addCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return;
    const code = `NX-${Date.now().toString().slice(-7)}`;
    const { error } = await supabase.from('customers').insert({ customer_code: code, full_name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, plan_name: plan, monthly_price: Number(price), connection_status: 'offline', is_active: true, billing_day: 1 });
    if (error) { setError(error.message); return; }
    setNotice('Pelanggan berhasil ditambahkan. Tagihan dibuat melalui proses bulanan.'); setName(''); setPhone(''); setAddress(''); await load();
  }
  async function toggleConnection(c: Customer) {
    if (!supabase) return;
    const next = c.connection_status === 'active' ? 'offline' : 'active';
    const { error } = await supabase.from('customers').update({ connection_status: next }).eq('id', c.id);
    if (error) setError(error.message); else { setNotice(`Status ${c.full_name} diubah menjadi ${next === 'active' ? 'aktif' : 'offline'}.`); await load(); }
  }
  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || !payInvoice) return;
    const amount = Number(payAmount); if (!Number.isFinite(amount) || amount <= 0) { setError('Nominal pembayaran harus lebih dari nol.'); return; }
    const { error } = await supabase.from('payments').insert({ invoice_id: payInvoice.id, amount, method: payMethod, paid_at: new Date().toISOString() });
    if (error) { setError(error.message); return; }
    setPayInvoice(null); setPayAmount(''); setNotice('Pembayaran tersimpan. Status tagihan diperbarui oleh database.'); await load();
  }

  return <main className="shell"><header className="top"><div className="brandmark">N</div><div className="brand"><h1>NEXAINDO</h1><p>INTERNET MANAGEMENT SYSTEM</p></div><span className="live">● DATABASE APP</span></header>
    <nav className="nav">{([['dashboard','Dashboard'],['customers','Pelanggan'],['invoices','Tagihan'],['reports','Laporan']] as const).map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {notice && <div className="notice">{notice}<button onClick={()=>setNotice('')}>Tutup</button></div>}{error && <div className="error">{error}</div>}
    {!authReady || (loggedIn && loading) ? <div className="panel">Memuat data NEXAINDO…</div> : !loggedIn ? <section className="panel loginpanel"><p className="eyebrow">AKSES ADMIN</p><h2>Masuk ke NEXAINDO</h2><p className="subtext">Gunakan akun yang sudah dibuat di Supabase → Authentication → Users.</p><form className="formgrid" onSubmit={login}><label>Email admin<input type="email" autoComplete="username" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="admin@domain.com"/></label><label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Password admin"/></label><button className="primary" type="submit">Masuk</button></form></section> : tab==='dashboard' ? <><section className="intro"><div><p className="eyebrow">RINGKASAN OPERASIONAL</p><h2>Dashboard</h2><p>Pantau pelanggan, tagihan, dan pemasukan bisnis internetmu.</p></div><button className="secondary" onClick={()=>void load()}>↻ Segarkan</button></section>
      <section className="stats"><Stat title="Total pelanggan" value={String(customers.filter(c=>c.is_active).length)} detail="Pelanggan aktif berlangganan"/><Stat title="Koneksi aktif" value={String(active)} detail="Status diperbarui manual"/><Stat title="Koneksi offline" value={String(offline)} detail="Status diperbarui manual"/><Stat title="Uang diterima bulan ini" value={money(monthPayments)} detail="Berdasarkan transaksi pembayaran"/></section>
      <section className="panel"><div className="panelhead"><div><h3>Ringkasan keuangan</h3><p>Periode {month}</p></div><button className="secondary" onClick={()=>setTab('reports')}>Lihat laporan →</button></div><div className="finances"><div><span>Sisa tagihan / piutang</span><strong>{money(dueTotal)}</strong></div><div><span>Total transaksi bulan ini</span><strong>{payments.filter(p=>p.paid_at.slice(0,7)===month).length}</strong></div></div></section>
      <section className="panel"><div className="panelhead"><div><h3>Pelanggan terbaru</h3><p>Data yang tersimpan di database</p></div><button className="secondary" onClick={()=>setTab('customers')}>Semua pelanggan →</button></div><CustomerTable customers={customers.slice(0,5)} toggle={toggleConnection}/></section></> : tab==='customers' ? <><section className="intro"><div><p className="eyebrow">DATA PELANGGAN</p><h2>Manajemen pelanggan</h2><p>Tambah pelanggan dan ubah status koneksi secara manual.</p></div></section><section className="panel"><h3>Tambah pelanggan</h3><form className="formgrid" onSubmit={addCustomer}><label>Nama pelanggan<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nama lengkap"/></label><label>Nomor HP<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="08xxxxxxxxxx"/></label><label>Alamat pemasangan<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Alamat pelanggan"/></label><label>Paket internet<select value={plan} onChange={e=>{setPlan(e.target.value);setPrice(e.target.value==='10 Mbps'?'150000':e.target.value==='20 Mbps'?'200000':'250000')}}><option>10 Mbps</option><option>20 Mbps</option><option>30 Mbps</option></select></label><label>Harga bulanan (Rp)<input type="number" min="1" required value={price} onChange={e=>setPrice(e.target.value)}/></label><button className="primary" type="submit">+ Simpan pelanggan</button></form></section><section className="panel"><div className="panelhead"><h3>Semua pelanggan ({customers.length})</h3><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama / kode / HP"/></div><CustomerTable customers={filteredCustomers} toggle={toggleConnection}/></section></> : tab==='invoices' ? <><section className="intro"><div><p className="eyebrow">PENAGIHAN BULANAN</p><h2>Tagihan pelanggan</h2><p>Jatuh tempo tanggal 1. Catat pembayaran saat dana diterima.</p></div></section><section className="panel"><div className="panelhead"><div><h3>Daftar tagihan</h3><p>Tagihan disimpan per pelanggan dan periode.</p></div><span className="pill">{invoices.length} tagihan</span></div>{invoices.length===0?<p className="empty">Belum ada tagihan. Jalankan fungsi pembuatan tagihan bulanan sesuai README.</p>:<div className="tablewrap"><table><thead><tr><th>Pelanggan</th><th>Periode</th><th>Tagihan</th><th>Jatuh tempo</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{invoices.map(i=>{const paid=payments.filter(p=>p.invoice_id===i.id).reduce((s,p)=>s+Number(p.amount),0);const status=paid>=Number(i.amount)?'Lunas':paid>0?'Sebagian':i.status==='void'?'Dibatalkan':new Date(i.due_date)<new Date()?'Terlambat':'Belum bayar';return <tr key={i.id}><td>{i.customers?.full_name || 'Pelanggan'}<small>{i.customers?.customer_code}</small></td><td>{i.period}</td><td>{money(i.amount)}<small>Dibayar: {money(paid)}</small></td><td>{i.due_date}</td><td><span className={`pill ${status==='Lunas'?'green':status==='Terlambat'?'red':''}`}>{status}</span></td><td>{i.status!=='void'&&paid<Number(i.amount)&&<button className="smallbtn" onClick={()=>{setPayInvoice(i);setPayAmount(String(Number(i.amount)-paid))}}>Catat bayar</button>}</td></tr>})}</tbody></table></div>}</section>{payInvoice&&<section className="panel"><h3>Catat pembayaran</h3><p>{payInvoice.customers?.full_name} · Sisa {money(Number(payInvoice.amount)-payments.filter(p=>p.invoice_id===payInvoice.id).reduce((s,p)=>s+Number(p.amount),0))}</p><form className="formgrid" onSubmit={recordPayment}><label>Nominal pembayaran<input type="number" min="1" required value={payAmount} onChange={e=>setPayAmount(e.target.value)}/></label><label>Metode<select value={payMethod} onChange={e=>setPayMethod(e.target.value)}><option value="transfer">Transfer bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option><option value="other">Lainnya</option></select></label><button className="primary" type="submit">Simpan pembayaran</button><button className="secondary" type="button" onClick={()=>setPayInvoice(null)}>Batal</button></form></section>}<section className="panel"><h3>Histori pembayaran terbaru</h3>{payments.length===0?<p className="empty">Belum ada transaksi.</p>:<div className="tablewrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Metode</th><th>Referensi tagihan</th></tr></thead><tbody>{payments.slice(0,30).map(p=><tr key={p.id}><td>{new Date(p.paid_at).toLocaleString('id-ID')}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.invoice_id.slice(0,8)}…</td></tr>)}</tbody></table></div>}</section></> : <><section className="intro"><div><p className="eyebrow">LAPORAN KEUANGAN</p><h2>Laporan bulanan</h2><p>Pemasukan dihitung berdasarkan tanggal pembayaran diterima.</p></div></section><section className="stats"><Stat title="Pemasukan bulan ini" value={money(monthPayments)} detail="Transaksi yang dibukukan bulan ini"/><Stat title="Total piutang terbuka" value={money(dueTotal)} detail="Sisa tagihan yang belum lunas"/><Stat title="Total pelanggan" value={String(customers.length)} detail="Semua data pelanggan"/><Stat title="Transaksi bulan ini" value={String(payments.filter(p=>p.paid_at.slice(0,7)===month).length)} detail="Jumlah pembayaran"/></section><section className="panel"><h3>Histori pembayaran</h3>{payments.length===0?<p className="empty">Belum ada data pembayaran.</p>:<div className="tablewrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Metode</th><th>Referensi</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{new Date(p.paid_at).toLocaleDateString('id-ID')}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.invoice_id.slice(0,8)}…</td></tr>)}</tbody></table></div>}</section></>}
    <footer>NEXAINDO · Internet Management System <span>{loggedIn ? <button className="logout" onClick={()=>void logout()}>Keluar</button> : 'Data disimpan di Supabase'}</span></footer>
  </main>;
}
function Stat({title,value,detail}:{title:string;value:string;detail:string}) { return <div className="stat"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }
function CustomerTable({customers,toggle}:{customers:Customer[];toggle:(c:Customer)=>void}) { if(!customers.length)return <p className="empty">Belum ada data pelanggan.</p>; return <div className="tablewrap"><table><thead><tr><th>Pelanggan</th><th>Paket</th><th>Harga / bulan</th><th>Status koneksi</th><th>Aksi</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td>{c.full_name}<small>{c.customer_code} · {c.phone||'Tanpa nomor HP'}</small></td><td>{c.plan_name}</td><td>{money(c.monthly_price)}</td><td><span className={`pill ${c.connection_status==='active'?'green':''}`}>{c.connection_status==='active'?'Aktif':c.connection_status==='offline'?'Offline':'Ditangguhkan'}</span></td><td><button className="smallbtn" onClick={()=>toggle(c)}>{c.connection_status==='active'?'Tandai offline':'Tandai aktif'}</button></td></tr>)}</tbody></table></div>; }
