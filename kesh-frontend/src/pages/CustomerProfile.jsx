import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiAuth, apiBookings, apiComplaints } from '../services/apiService';

// Status DB me 'Pending' ya 'pending' kuch bhi ho sakta hai, isliye hamesha lowercase me compare karo
const STATUS_STYLE = {
  confirmed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  completed: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
  pending: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  cancelled: 'bg-red-500/10 border-red-500/30 text-red-400',
  rejected: 'bg-red-500/10 border-red-500/30 text-red-400'
};
const statusKey = (s) => String(s || '').toLowerCase();
const statusText = (s) => {
  const k = statusKey(s);
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Pending';
};

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDate = (d) => {
  if (!d) return 'Date save nahi hui';
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(x.getTime())
    ? String(d)
    : x.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// Review tabhi jab appointment ho chuki ho aur booking cancel/reject na hui ho
const canReview = (b) =>
  ['confirmed', 'completed'].includes(statusKey(b.status)) && b.date && b.date <= todayStr();

// Backend kabhi snake_case (salon_name) bhejta hai, kabhi camelCase (salonName). Dono chalenge.
const toLocalDate = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const normalizeBooking = (b) => ({
  ...b,
  salonName: b.salonName ?? b.salon_name,
  salonAddress: b.salonAddress ?? b.salon_address,
  salonPhone: b.salonPhone ?? b.salon_phone,
  ownerName: b.ownerName ?? b.owner_name,
  serviceName: b.serviceName ?? b.service_name,
  serviceType: b.serviceType ?? b.service_type,
  price: b.price ?? (b.total_price !== null && b.total_price !== undefined ? Number(b.total_price) : null),
  date: b.date ?? toLocalDate(b.booking_date),
  slot: b.slot ?? b.time_slot,
  paymentStatus: b.paymentStatus ?? b.payment_status,
  refundAmount: b.refundAmount ?? b.refund_amount ?? null,
  refundStatus: b.refundStatus ?? b.refund_status ?? null,
  cancelledBy: b.cancelledBy ?? b.cancelled_by ?? null
});

const isFinished = (b) => ['completed', 'cancelled', 'rejected'].includes(statusKey(b.status));
const canCancel = (b) => ['pending', 'confirmed'].includes(statusKey(b.status));
const canReschedule = (b) => canCancel(b) && Number(b.reschedule_count || 0) < 2;
const needsPayment = (b) =>
  canCancel(b) &&
  !['paid', 'success', 'succeeded', 'captured', 'refunded', 'partially refunded'].includes(String(b.paymentStatus || '').toLowerCase()) &&
  b.payment_method !== 'pay_at_salon';

function Detail({ icon, label, children }) {
  return (
    <div className="flex gap-2 text-xs min-w-0">
      <i className={`fa-solid ${icon} text-amber-400 w-4 mt-0.5`}></i>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <div className="text-slate-200 break-words">{children}</div>
      </div>
    </div>
  );
}

export default function CustomerProfile() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [cancelInfo, setCancelInfo] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [reschedId, setReschedId] = useState(null);
  const [rDate, setRDate] = useState('');
  const [rSlots, setRSlots] = useState(null); // null = date chuni nahi / load ho raha
  const [rSlot, setRSlot] = useState('');
  const [rMsg, setRMsg] = useState('');
  const [complainId, setComplainId] = useState(null);
  const [complainText, setComplainText] = useState('');

  // Stored User Profile Data (Backend ke full_name aur mobile ke sath map kiya gaya hai)
  // Profile ka asli data server (DB) me hai. localStorage sirf pehli jhalak ke liye.
  const [userProfile, setUserProfile] = useState(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('groomax_user')); } catch (e) { saved = null; }
    return {
      name: saved?.full_name || '',
      email: saved?.email || '',
      phone: saved?.mobile || '',
      address: saved?.address || '',
      role: saved?.role || 'customer'
    };
  });
  const [profileMsg, setProfileMsg] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    apiAuth.me()
      .then((r) => {
        const u = r.user;
        setUserProfile({ name: u.full_name, email: u.email, phone: u.mobile, address: u.address || '', role: u.role });
        localStorage.setItem('groomax_user', JSON.stringify(u));
      })
      .catch(() => {});
  }, []);

  const reload = async () => {
    const data = await apiBookings.getUserBookings();
    setBookings(Array.isArray(data) ? data.map(normalizeBooking) : []);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        const data = await apiBookings.getUserBookings();
        if (!cancelled) setBookings(Array.isArray(data) ? data.map(normalizeBooking) : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(err.message || err.error || 'Appointments load nahi ho payi. Dobara login karke try karein.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCancel = async (b) => {
    setNotice('');
    setReschedId(null);
    setComplainId(null);
    setCancelId(b.id);
    setCancelInfo(null);
    try {
      const r = await apiBookings.getCancelPreview(b.id);
      setCancelInfo(r);
    } catch (err) {
      setCancelInfo({ error: err.message || 'Refund ki jaankari nahi mili.' });
    }
  };

  const confirmCancel = async (b) => {
    setBusyId(b.id);
    try {
      const r = await apiBookings.cancelBooking(b.id);
      setNotice(r.message || 'Booking cancel ho gayi.');
      setCancelId(null);
      setCancelInfo(null);
      await reload();
    } catch (err) {
      setNotice(err.message || 'Cancel nahi ho payi. Dobara try karein.');
    } finally {
      setBusyId(null);
    }
  };

  const startResched = (b) => {
    setNotice('');
    setCancelId(null);
    setComplainId(null);
    setReschedId(b.id);
    setRDate('');
    setRSlots(null);
    setRSlot('');
    setRMsg('');
  };

  const pickReschedDate = async (b, date) => {
    setRDate(date);
    setRSlot('');
    setRMsg('');
    setRSlots(null);
    if (!date) return;
    try {
      const r = await apiBookings.getAvailability(b.salon_id, date);
      if (r.holiday) setRMsg(`Salon is din band rahega${r.reason ? ` (${r.reason})` : ''}.`);
      setRSlots(r.filter((x) => x.available));
    } catch (err) {
      setRMsg(err.message || 'Slots load nahi ho paye.');
      setRSlots([]);
    }
  };

  const confirmResched = async (b) => {
    setBusyId(b.id);
    try {
      const r = await apiBookings.reschedule(b.id, rDate, rSlot);
      setNotice(r.message || 'Time badal gaya.');
      setReschedId(null);
      await reload();
    } catch (err) {
      setRMsg(err.message || 'Time badal nahi paya.');
    } finally {
      setBusyId(null);
    }
  };

  const sendComplaint = async (b) => {
    setBusyId(b.id);
    try {
      const r = await apiComplaints.create(complainText, b.id);
      setNotice(r.message || 'Shikayat darj ho gayi.');
      setComplainId(null);
      setComplainText('');
    } catch (err) {
      setNotice(err.message || 'Shikayat bhej nahi paye.');
    } finally {
      setBusyId(null);
    }
  };

  const hideOne = async (b) => {
    setBusyId(b.id);
    try {
      await apiBookings.hideBooking(b.id);
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
    } catch (err) {
      setNotice(err.message || 'List se hata nahi paye.');
    } finally {
      setBusyId(null);
    }
  };

  const clearFinished = async () => {
    if (!window.confirm('Saari khatam (Completed / Cancelled / Rejected) bookings aapki list se hata di jayengi. Review aur refund ka record safe rahega. Aage badhein?')) return;
    try {
      const r = await apiBookings.clearFinished();
      setNotice(r.message || 'Hata di gayi.');
      await reload();
    } catch (err) {
      setNotice(err.message || 'Nahi hata paye.');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileSaving(true);
    try {
      const res = await apiAuth.updateProfile(userProfile.name, userProfile.phone, userProfile.address);
      const u = res.user;
      setUserProfile({ name: u.full_name, email: u.email, phone: u.mobile, address: u.address || '', role: u.role });
      localStorage.setItem('groomax_user', JSON.stringify(u));
      setIsEditing(false);
      setProfileMsg('Profile save ho gaya.');
    } catch (err) {
      setProfileMsg(err.message || 'Save nahi ho paya.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <div className="max-w-5xl mx-auto p-4 md:p-8">

        {/* Header Bar with Action Shortcuts */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-amber-400">Customer Account Profile</h1>
            <p className="text-xs text-slate-400">Manage personal details, saved location, and appointment history.</p>
          </div>
          <button
            onClick={() => navigate('/customer/reviews')}
            className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-4 py-2 rounded-xl transition flex items-center gap-1.5"
          >
            <i className="fa-solid fa-star"></i> My Reviews Page
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Section 12: Personal Details & Account Settings */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl h-fit">
            <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-bold rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-lg shadow-amber-500/20">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={userProfile.name}
                    onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={userProfile.phone}
                    onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Saved Address (Lucknow)</label>
                  <input
                    type="text"
                    value={userProfile.address}
                    onChange={(e) => setUserProfile({ ...userProfile, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                {profileMsg && <p className="text-[11px] text-rose-400">{profileMsg}</p>}
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-full bg-amber-500 text-slate-950 font-bold py-2 rounded-xl text-xs hover:bg-amber-400 disabled:opacity-60"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile Settings'}
                </button>
              </form>
            ) : (
              <div>
                <h3 className="font-bold text-lg text-slate-100">{userProfile.name}</h3>
                {profileMsg && <p className="text-[11px] text-emerald-400 mb-1">{profileMsg}</p>}
                <p className="text-xs text-slate-400 mb-1"><i className="fa-solid fa-envelope text-amber-400 mr-1"></i> {userProfile.email}</p>
                <p className="text-xs text-slate-400 mb-1"><i className="fa-solid fa-phone text-amber-400 mr-1"></i> {userProfile.phone}</p>
                <p className="text-xs text-slate-400 mb-4"><i className="fa-solid fa-location-dot text-amber-400 mr-1"></i> {userProfile.address || 'Address add karein'}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 py-2 rounded-xl text-slate-300 font-semibold"
                  >
                    Edit Settings
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Appointment History List with Write Review Shortcut */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-amber-400"></i> My Appointment History
              </span>
              {bookings.some(isFinished) && (
                <button
                  onClick={clearFinished}
                  className="text-[11px] bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 px-3 py-1.5 rounded-lg font-normal"
                >
                  Saari khatam bookings hatayein
                </button>
              )}
            </h3>
            {notice && (
              <div className="bg-slate-900 border border-amber-500/30 text-amber-300 text-xs p-3 rounded-xl">{notice}</div>
            )}

            {loading ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl text-center text-slate-400 text-xs">
                <i className="fa-solid fa-spinner animate-spin text-xl text-amber-400 mb-2"></i>
                <p>Loading your appointments...</p>
              </div>
            ) : loadError ? (
              <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl text-center text-red-400 text-xs">
                {loadError}
              </div>
            ) : bookings.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl text-center text-slate-400 text-xs">
                No bookings found yet. Explore salons and book your first slot!
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => {
                  const key = statusKey(b.status);
                  const isHome = b.serviceType === 'doorstep';
                  const mapsUrl = b.salonAddress
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.salonName || ''} ${b.salonAddress}`.trim())}`
                    : null;

                  return (
                    <div key={b.id} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100 text-sm">{b.salonName || 'Salon'}</p>
                          <p className="text-[11px] text-slate-500">Booking #{b.id}</p>
                        </div>
                        <span className={`text-xs px-3 py-1 rounded-full font-bold border whitespace-nowrap ${
                          STATUS_STYLE[key] || 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          {statusText(b.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <Detail icon="fa-scissors" label="Service">
                          {b.serviceName || 'Service'} •{' '}
                          <span className="text-amber-400 font-semibold">
                            {b.price !== null && b.price !== undefined ? `₹${b.price}` : 'Price save nahi hui'}
                          </span>
                        </Detail>

                        <Detail icon="fa-calendar" label="Date & Time Slot">
                          {fmtDate(b.date)}{b.slot ? ` at ${b.slot}` : ''}
                        </Detail>

                        <Detail icon={isHome ? 'fa-house-user' : 'fa-store'} label="Visit Type">
                          {isHome ? 'Home Service (stylist aapke ghar aayega)' : 'Salon Visit'}
                        </Detail>

                        {b.paymentStatus || b.payment_method ? (
                          <Detail icon="fa-wallet" label="Payment">
                            {[b.paymentStatus, b.payment_method].filter(Boolean).join(' • ')}
                          </Detail>
                        ) : null}

                        {b.refundAmount !== null && b.refundAmount !== undefined ? (
                          <Detail icon="fa-rotate-left" label="Refund">
                            ₹{Number(b.refundAmount)} • {b.refundStatus || 'Pending'}
                            {b.refundStatus && b.refundStatus !== 'Processed' ? ' (5-7 din me aayega)' : ''}
                          </Detail>
                        ) : null}

                        <Detail icon="fa-location-dot" label="Salon Address">
                          {b.salonAddress || 'Address available nahi'}
                          {mapsUrl && (
                            <>
                              {' '}
                              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                                Map par dekhein
                              </a>
                            </>
                          )}
                        </Detail>

                        {b.salonPhone ? (
                          <Detail icon="fa-phone" label="Salon Contact">
                            <a href={`tel:${b.salonPhone}`} className="text-amber-400 hover:underline">{b.salonPhone}</a>
                            {b.ownerName ? ` (${b.ownerName})` : ''}
                          </Detail>
                        ) : null}

                        {isHome && b.address ? (
                          <Detail icon="fa-house" label="Aapka Address">
                            {b.address}
                          </Detail>
                        ) : null}
                      </div>

                      {cancelId === b.id && (
                        <div className="bg-slate-950 border border-red-500/30 rounded-xl p-3 text-xs space-y-2">
                          {!cancelInfo ? (
                            <p className="text-slate-400">Refund ka hisaab check ho raha hai...</p>
                          ) : cancelInfo.error ? (
                            <p className="text-red-400">{cancelInfo.error}</p>
                          ) : (
                            <p className="text-slate-200">
                              {cancelInfo.canCancel === false
                                ? cancelInfo.reason || 'Ye booking cancel nahi ho sakti.'
                                : !cancelInfo.paid
                                  ? 'Booking cancel karni hai? Abhi payment nahi hua hai, isliye refund ka sawal nahi.'
                                  : cancelInfo.amount > 0
                                    ? `Cancel karne par ₹${cancelInfo.amount}${cancelInfo.percent < 100 ? ` (${cancelInfo.percent}%)` : ''} refund milega.`
                                    : 'Is time cancel karne par refund nahi milega.'}
                            </p>
                          )}
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setCancelId(null); setCancelInfo(null); }}
                              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300"
                            >
                              Nahi, rehne do
                            </button>
                            <button
                              disabled={busyId === b.id || !cancelInfo || !!cancelInfo.error || cancelInfo.canCancel === false}
                              onClick={() => confirmCancel(b)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 disabled:opacity-50"
                            >
                              {busyId === b.id ? 'Cancel ho raha hai...' : 'Haan, cancel karein'}
                            </button>
                          </div>
                        </div>
                      )}

                      {reschedId === b.id && (
                        <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-xs space-y-2">
                          <p className="text-slate-300">Nayi date chuniye. Naya time owner dobara confirm karega.</p>
                          <input
                            type="date"
                            aria-label="Nayi date"
                            min={todayStr()}
                            value={rDate}
                            onChange={(e) => pickReschedDate(b, e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
                          />
                          {rDate && rSlots === null && <p className="text-slate-400">Slots dekh rahe hain...</p>}
                          {rSlots && rSlots.length === 0 && !rMsg && <p className="text-slate-400">Is din koi slot khali nahi.</p>}
                          {rSlots && rSlots.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {rSlots.map((sl) => (
                                <button
                                  key={sl.id}
                                  type="button"
                                  onClick={() => setRSlot(sl.time_slot)}
                                  className={`px-3 py-1.5 rounded-lg border ${rSlot === sl.time_slot ? 'bg-amber-500 text-slate-950 border-amber-500' : 'border-slate-700 text-slate-300'}`}
                                >
                                  {sl.time_slot}
                                </button>
                              ))}
                            </div>
                          )}
                          {rMsg && <p className="text-rose-400">{rMsg}</p>}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setReschedId(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">Rehne do</button>
                            <button
                              disabled={busyId === b.id || !rDate || !rSlot}
                              onClick={() => confirmResched(b)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 disabled:opacity-50"
                            >
                              {busyId === b.id ? 'Badal rahe hain...' : 'Time badlein'}
                            </button>
                          </div>
                        </div>
                      )}

                      {complainId === b.id && (
                        <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs space-y-2">
                          <label htmlFor={`complain-${b.id}`} className="text-slate-300">Kya problem hui? Thodi detail me likhein.</label>
                          <textarea
                            id={`complain-${b.id}`}
                            value={complainText}
                            onChange={(e) => setComplainText(e.target.value)}
                            maxLength={1000}
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setComplainId(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">Rehne do</button>
                            <button
                              disabled={busyId === b.id || complainText.trim().length < 5}
                              onClick={() => sendComplaint(b)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 disabled:opacity-50"
                            >
                              Shikayat bhejein
                            </button>
                          </div>
                        </div>
                      )}

                      {(
                        <div className="flex flex-wrap justify-end gap-2">
                          {needsPayment(b) && (
                            <button
                              onClick={() => navigate(`/customer/payment/${b.id}`)}
                              className="text-[11px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg"
                            >
                              Payment karein
                            </button>
                          )}
                          {canReschedule(b) && reschedId !== b.id && (
                            <button
                              onClick={() => startResched(b)}
                              className="text-[11px] bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-slate-300 px-3 py-1.5 rounded-lg"
                            >
                              Time badlein
                            </button>
                          )}
                          {complainId !== b.id && (
                            <button
                              onClick={() => { setNotice(''); setCancelId(null); setReschedId(null); setComplainId(b.id); setComplainText(''); }}
                              className="text-[11px] bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-400 px-3 py-1.5 rounded-lg"
                            >
                              Problem batayein
                            </button>
                          )}
                          {canCancel(b) && cancelId !== b.id && (
                            <button
                              onClick={() => startCancel(b)}
                              className="text-[11px] bg-slate-950 border border-slate-800 hover:border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg"
                            >
                              Booking cancel karein
                            </button>
                          )}
                          {canReview(b) && (
                            <button
                              onClick={() => navigate(`/customer/reviews?booking=${b.id}`)}
                              className="text-[11px] bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-amber-400 px-3 py-1.5 rounded-lg"
                            >
                              Review likhein
                            </button>
                          )}
                          {isFinished(b) && (
                            <button
                              disabled={busyId === b.id}
                              onClick={() => hideOne(b)}
                              className="text-[11px] bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-400 px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              List se hatayein
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
