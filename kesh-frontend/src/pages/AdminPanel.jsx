import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import { apiAdmin } from '../services/apiService';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie' },
  { id: 'salons', label: 'Salon Approvals', icon: 'fa-store' },
  { id: 'users', label: 'Users', icon: 'fa-users' },
  { id: 'bookings', label: 'Bookings', icon: 'fa-calendar-check' },
  { id: 'refunds', label: 'Refunds', icon: 'fa-rotate-left' },
  { id: 'reviews', label: 'Reviews', icon: 'fa-comments' },
  { id: 'complaints', label: 'Complaints', icon: 'fa-triangle-exclamation' }
];

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const STATUS_CLS = {
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  completed: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  processed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  open: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  rejected: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
};
const Chip = ({ value }) => (
  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${STATUS_CLS[String(value || '').toLowerCase()] || 'bg-slate-900 text-slate-400 border-slate-700'}`}>
    {cap(value)}
  </span>
);
const Card = ({ title, icon, children }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
    <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
      <i className={`fa-solid ${icon} text-amber-400`}></i> {title}
    </h2>
    <div className="space-y-3">{children}</div>
  </div>
);
const Row = ({ children }) => (
  <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">{children}</div>
);
const Empty = ({ text }) => <p className="text-xs text-slate-500 text-center py-6">{text}</p>;
const Btn = ({ tone = 'slate', ...p }) => {
  const t = {
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    red: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    slate: 'bg-slate-900 text-slate-300 border-slate-700'
  }[tone];
  return <button {...p} className={`px-3 py-1.5 border rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 ${t}`} />;
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({}); // tab -> list ya object
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [notes, setNotes] = useState({}); // complaint id -> jawab
  const [refs, setRefs] = useState({}); // refund id -> UPI reference

  const loaders = {
    dashboard: apiAdmin.overview,
    salons: apiAdmin.salons,
    users: apiAdmin.users,
    bookings: apiAdmin.bookings,
    refunds: apiAdmin.refunds,
    reviews: apiAdmin.reviews,
    complaints: apiAdmin.complaints
  };

  const load = useCallback(async (which) => {
    setLoading(true);
    setError('');
    try {
      const result = await loaders[which]();
      setData((d) => ({ ...d, [which]: result }));
    } catch (err) {
      setError(err.message || 'Data load nahi ho paya. Admin account se login hai?');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const act = async (key, fn, okMsg, reloadTab = tab) => {
    if (busy) return;
    setBusy(key);
    setMsg('');
    setError('');
    try {
      const r = await fn();
      setMsg((r && r.message) || okMsg);
      await load(reloadTab);
    } catch (err) {
      setError(err.message || 'Kaam nahi ho paya.');
    } finally {
      setBusy(null);
    }
  };

  const list = Array.isArray(data[tab]) ? data[tab] : [];
  const ov = data.dashboard;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <div>
        <div className="bg-slate-900 border-b border-slate-800 p-4 md:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-amber-400 font-bold text-xl shadow">
                <i className="fa-solid fa-user-shield"></i>
              </div>
              <div>
                <h1 className="text-xl font-black text-amber-400 tracking-tight">GROO MAX</h1>
                <p className="text-xs text-slate-400">Super Admin Control Hub</p>
              </div>
            </div>
            <button onClick={() => navigate('/')} className="text-xs bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-amber-400 px-4 py-2.5 rounded-xl transition cursor-pointer font-semibold">
              ← Main Menu
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex flex-wrap gap-2 mb-6">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setMsg(''); }}
                className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                  tab === t.id ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <i className={`fa-solid ${t.icon}`}></i> {t.label}
                {t.id === 'complaints' && ov && ov.open_complaints > 0 ? ` (${ov.open_complaints})` : ''}
              </button>
            ))}
          </div>

          {error && <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">{error}</div>}
          {msg && <div className="mb-4 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">{msg}</div>}
          {loading && !data[tab] && <p className="text-xs text-slate-400 mb-4"><i className="fa-solid fa-spinner animate-spin mr-2"></i>Load ho raha hai...</p>}

          {/* DASHBOARD */}
          {tab === 'dashboard' && ov && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  ['Customers', ov.customers, 'text-amber-400'],
                  ['Salons (approved / total)', `${ov.salons.approved} / ${ov.salons.total}`, 'text-emerald-400'],
                  ['Approval baaki', ov.salons.pending, 'text-rose-400'],
                  ['Total Bookings', ov.bookings.total, 'text-sky-400'],
                  ['Completed Bookings Revenue', `₹${ov.gross}`, 'text-amber-400'],
                  [`Platform Commission (${ov.commission_percent}%)`, `₹${ov.commission}`, 'text-indigo-400'],
                  ['Refund bhejna baaki', `${ov.refunds_to_send} (₹${ov.refunds_to_send_amount})`, 'text-rose-400'],
                  ['Open Complaints', ov.open_complaints, 'text-amber-400']
                ].map(([label, value, cls]) => (
                  <div key={label} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className={`text-2xl font-black ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl text-xs text-slate-400 leading-relaxed">
                Bookings: {ov.bookings.pending} pending, {ov.bookings.confirmed} confirmed, {ov.bookings.completed} completed, {ov.bookings.cancelled} cancelled/rejected.
                Home service bookings: {ov.bookings.home_bookings}. Online paid total: ₹{ov.online_paid}. Salon owners: {ov.owners}.
              </div>
            </div>
          )}

          {/* SALONS */}
          {tab === 'salons' && (
            <Card title="Salon Verification & Status" icon="fa-store">
              {list.length === 0 ? <Empty text="Abhi koi salon nahi." /> : list.map((s) => (
                <Row key={s.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sm text-slate-200">{s.salon_name}</p>
                      <Chip value={s.status} />
                      {s.is_home_service && <span className="text-[10px] text-amber-400 border border-amber-500/20 px-2 rounded">Home service</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{s.area} • {s.address}</p>
                    <p className="text-xs text-slate-500">Owner: {s.owner_name || '-'} {s.owner_phone ? `• ${s.owner_phone}` : ''} {s.owner_email ? `• ${s.owner_email}` : ''} • {s.bookings_count} bookings</p>
                  </div>
                  <div className="flex gap-2">
                    {s.status !== 'approved' && <Btn tone="green" disabled={!!busy} onClick={() => act(`s${s.id}`, () => apiAdmin.setSalonStatus(s.id, 'approved'), 'Salon approve ho gaya.')}>Approve</Btn>}
                    {s.status === 'pending' && <Btn tone="red" disabled={!!busy} onClick={() => act(`s${s.id}`, () => apiAdmin.setSalonStatus(s.id, 'rejected'), 'Salon reject ho gaya.')}>Reject</Btn>}
                    {s.status === 'approved' && <Btn tone="red" disabled={!!busy} onClick={() => act(`s${s.id}`, () => apiAdmin.setSalonStatus(s.id, 'pending'), 'Salon rok diya gaya.')}>Suspend</Btn>}
                  </div>
                </Row>
              ))}
            </Card>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <Card title="Registered Users & Partners" icon="fa-users">
              {list.length === 0 ? <Empty text="Koi user nahi." /> : list.map((u) => (
                <Row key={u.id}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-200">{u.full_name}</p>
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold">{u.role}</span>
                    </div>
                    <p className="text-xs text-slate-500">{u.email} • {u.mobile}</p>
                  </div>
                  <span className="text-[11px] text-slate-500">Joined {fmtDate(u.created_at)}</span>
                </Row>
              ))}
            </Card>
          )}

          {/* BOOKINGS */}
          {tab === 'bookings' && (
            <Card title="Platform Bookings Record" icon="fa-calendar-check">
              {list.length === 0 ? <Empty text="Abhi koi booking nahi." /> : list.map((b) => (
                <Row key={b.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-amber-400">#{b.id}</span>
                      <span className="font-bold text-sm text-slate-200">{b.customer_name}</span>
                      <Chip value={b.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{b.salon_name} • {b.service_name} • {b.booking_date} {b.time_slot} • ₹{Number(b.total_price)}</p>
                    <p className="text-xs text-slate-500">{b.service_type === 'doorstep' ? 'Home service' : 'Salon visit'} • Payment: {b.payment_status || 'Unpaid'} {b.payment_method ? `(${b.payment_method})` : ''} • {b.customer_phone}</p>
                  </div>
                </Row>
              ))}
            </Card>
          )}

          {/* REFUNDS */}
          {tab === 'refunds' && (
            <Card title="Refund Queue" icon="fa-rotate-left">
              {list.length === 0 ? <Empty text="Koi refund nahi." /> : list.map((r) => {
                const open = ['Pending', 'Failed'].includes(r.status);
                return (
                  <Row key={r.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-200">₹{Number(r.amount)} ({r.percent}%)</span>
                        <Chip value={r.status} />
                        <span className="font-mono text-xs text-amber-400">Booking #{r.booking_id}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{r.customer_name} ({r.customer_phone}) • {r.salon_name} • {r.service_name} • {r.booking_date} {r.time_slot}</p>
                      <p className="text-xs text-slate-500">Payment: {r.payment_method || '-'} {r.payment_id ? `• ${r.payment_id}` : ''}</p>
                      {r.error && <p className="text-xs text-rose-400 mt-1">{r.error}</p>}
                    </div>
                    {open && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          aria-label={`UPI reference refund ${r.id}`}
                          placeholder="UPI / bank reference"
                          value={refs[r.id] || ''}
                          onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })}
                          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        />
                        <Btn tone="green" disabled={!!busy} onClick={() => act(`r${r.id}`, () => apiAdmin.refundAction(r.id, 'mark_sent', refs[r.id]), 'Refund bhej diya mark ho gaya.')}>Maine bhej diya</Btn>
                        <Btn disabled={!!busy} onClick={() => act(`r${r.id}`, () => apiAdmin.refundAction(r.id, 'retry'), 'Gateway ko dobara bheja.')}>Gateway se bhejein</Btn>
                      </div>
                    )}
                  </Row>
                );
              })}
            </Card>
          )}

          {/* REVIEWS */}
          {tab === 'reviews' && (
            <Card title="Customer Reviews & Moderation" icon="fa-comments">
              {list.length === 0 ? <Empty text="Abhi koi review nahi." /> : list.map((rev) => (
                <Row key={rev.id}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-200">{rev.user_name || rev.user}</span>
                      <span className="text-amber-400 text-xs">★ {rev.rating}</span>
                      <span className="text-[10px] text-slate-500">({rev.salon_name})</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 break-words">"{rev.comment}"</p>
                  </div>
                  <Btn tone="red" disabled={!!busy} onClick={() => act(`v${rev.id}`, () => apiAdmin.deleteReview(rev.id), 'Review hata diya gaya.')}>Remove Review</Btn>
                </Row>
              ))}
            </Card>
          )}

          {/* COMPLAINTS */}
          {tab === 'complaints' && (
            <Card title="Customer Complaints" icon="fa-triangle-exclamation">
              {list.length === 0 ? <Empty text="Koi shikayat nahi." /> : list.map((c) => (
                <Row key={c.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-200">{c.customer_name}</span>
                      <Chip value={c.status} />
                      {c.booking_id && <span className="font-mono text-xs text-amber-400">Booking #{c.booking_id}</span>}
                      {c.salon_name && <span className="text-[10px] text-slate-500">({c.salon_name})</span>}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 break-words">{c.message}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{c.customer_phone} • {fmtDate(c.created_at)}</p>
                    {c.admin_note && <p className="text-xs text-emerald-400 mt-1">Jawab: {c.admin_note}</p>}
                  </div>
                  {c.status === 'Open' ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        aria-label={`Jawab shikayat ${c.id}`}
                        placeholder="Customer ko jawab"
                        value={notes[c.id] || ''}
                        onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                      />
                      <Btn tone="green" disabled={!!busy} onClick={() => act(`c${c.id}`, () => apiAdmin.resolveComplaint(c.id, 'Resolved', notes[c.id]), 'Shikayat band ho gayi.')}>Resolve</Btn>
                    </div>
                  ) : (
                    <Btn disabled={!!busy} onClick={() => act(`c${c.id}`, () => apiAdmin.resolveComplaint(c.id, 'Open'), 'Dobara open ho gayi.')}>Reopen</Btn>
                  )}
                </Row>
              ))}
            </Card>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
