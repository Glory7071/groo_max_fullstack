import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API = 'http://localhost:5000/api/owner';
const waUrl = (phone, text) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(text || '')}`;
};
const getToken = () => {
  try {
    const u = JSON.parse(localStorage.getItem('groomax_user'));
    return u?.token || localStorage.getItem('token');
  } catch {
    return localStorage.getItem('token');
  }
};
const authFetch = async (path, options = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) }
  });
  let data = {};
  try { data = await res.json(); } catch { /* HTML ya khali jawab */ }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || 'Request fail ho gayi. Backend restart kiya?');
  }
  return data;
};
const isFinishedStatus = (st) => ['Completed', 'Cancelled', 'Rejected'].includes(st);

export default function OwnerPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const [salonDetails, setSalonDetails] = useState({
    id: null,
    name: 'Loading Salon...',
    category: 'Unisex',
    area: '',
    address: '',
    openingHours: '09:00 AM - 09:00 PM',
    workingDays: 'Monday - Saturday',
    approvalStatus: 'Pending',
    isOpen: true
  });

  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [slotList, setSlotList] = useState([]);
  const [newSlot, setNewSlot] = useState('');
  const [homeSettings, setHomeSettings] = useState({ enabled: false, charge: '0', radius: '5' });
  const [stats, setStats] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', reason: '' });
  const [settingsMsg, setSettingsMsg] = useState('');

  const [bookingFilter, setBookingFilter] = useState('All');
  const [newService, setNewService] = useState({ name: '', price: '', duration: '' });
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // { text, wa }
  const [updatingId, setUpdatingId] = useState(null);

  // 1. Fetch Owner Salon, Services & Bookings on Load
  useEffect(() => {
    const fetchOwnerData = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('groomax_user'));
        const tokenCheck = user?.token || localStorage.getItem('token');
        if (!tokenCheck) {
          setLoadError('Login nahi hai. Pehle owner account se login karein.');
          return;
        }
        const token = user?.token || localStorage.getItem('token');

        const res = await fetch('http://localhost:5000/api/owner/salon/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const result = await res.json();
        
        if (result.success && result.data?.salon) {
          const s = result.data.salon;
          setSalonDetails({
            id: s.id,
            name: s.salon_name || s.name,
            category: s.category || 'Unisex',
            area: s.area || '',
            address: s.address || '',
            openingHours: s.openinghours || '09:00 AM - 09:00 PM',
            workingDays: 'Monday - Saturday',
            approvalStatus: s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : 'Pending',
            isOpen: s.is_open ?? true
          });

          setHomeSettings({
            enabled: !!s.is_home_service,
            charge: String(s.home_service_charge ?? 0),
            radius: String(s.service_radius_km ?? 5)
          });
          if (result.data.stats) setStats(result.data.stats);
          loadSlots();
          loadHolidays();

          if (result.data.services) {
            setServices(result.data.services.map(srv => ({
              id: srv.id,
              name: srv.name,
              price: Number(srv.price),
              duration: srv.duration,
              active: srv.is_active
            })));
          }

          if (result.data.bookings) {
            setBookings(result.data.bookings.map(b => ({
              id: b.id,
              customerName: b.customer_name || 'Customer',
              service: b.service_name,
              slot: b.time_slot,
              date: b.booking_date || '',
              status: b.status,
              phone: b.customer_phone || '',
              address: b.address || '',
              total: Number(b.total_price) || 0,
              paymentStatus: b.payment_status || '',
              visitType: b.service_type === 'doorstep' ? 'Home Service' : 'Salon Visit'
            })));
          }
        } else {
          setLoadError(result.message || result.error || 'Salon ka data load nahi ho paya.');
        }
      } catch (err) {
        console.error('Error fetching owner data from DB:', err);
        setLoadError('Server se connect nahi ho paya. Backend chal raha hai ya nahi dekhein.');
      }
    };

    fetchOwnerData();
  }, []);

  // 2. Add New Service Handler
  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.name || !newService.price) {
      alert('Kripya Service Name aur Price bharein!');
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('groomax_user'));
      const token = user?.token || localStorage.getItem('token');

      const response = await fetch('http://localhost:5000/api/owner/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          salon_id: salonDetails.id,
          name: newService.name,
          category: 'General',
          price: Number(newService.price),
          duration: newService.duration || '30 mins'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setServices([...services, { 
          id: data.service.id, 
          name: data.service.name, 
          price: Number(data.service.price), 
          duration: data.service.duration, 
          active: true 
        }]);
        setNewService({ name: '', price: '', duration: '' });
        alert('Service successfully added to database!');
      } else {
        alert('Error: ' + (data.error || data.message || 'Action blocked (Salon might be pending approval)'));
      }
    } catch (err) {
      console.error('Failed to add service:', err);
    }
  };

  // 3. Delete Service Handler (Database Connected)
  const deleteService = async (id) => {
    if (window.confirm('Kya aap is service ko database se permanently delete karna chahte hain?')) {
      try {
        const user = JSON.parse(localStorage.getItem('groomax_user'));
        const token = user?.token || localStorage.getItem('token');

        const response = await fetch(`http://localhost:5000/api/owner/services/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setServices(services.filter(s => s.id !== id));
          alert('Service successfully deleted from database!');
        } else {
          alert('Error deleting service.');
        }
      } catch (err) {
        console.error('Failed to delete service:', err);
      }
    }
  };

  // 4. Toggle Service Status (Active / Disabled)
  const toggleServiceActive = async (id) => {
    try {
      const user = JSON.parse(localStorage.getItem('groomax_user'));
      const token = user?.token || localStorage.getItem('token');

      const response = await fetch(`http://localhost:5000/api/owner/services/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setServices(services.map(s => s.id === id ? { ...s, active: data.service.is_active } : s));
      }
    } catch (err) {
      console.error('Failed to toggle service status:', err);
    }
  };

  // 5. Update Salon Profile Handler
  const handleUpdateSalonProfile = async (e) => {
    e.preventDefault();
    try {
      const user = JSON.parse(localStorage.getItem('groomax_user'));
      const token = user?.token || localStorage.getItem('token');

      const response = await fetch('http://localhost:5000/api/owner/salon', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: salonDetails.name,
          area: salonDetails.area,
          address: salonDetails.address,
          openingHours: salonDetails.openingHours
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('Salon profile updated successfully in database!');
      } else {
        alert('Error updating profile: ' + (data.message || 'Failed'));
      }
    } catch (err) {
      console.error('Failed to update salon profile:', err);
    }
  };

  const loadSlots = async () => {
    try {
      const d = await authFetch('/my-slots');
      setSlotList(d.slots || []);
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const loadHolidays = async () => {
    try {
      const d = await authFetch('/my-holidays');
      setHolidays(d.holidays || []);
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const addHoliday = async (e) => {
    e.preventDefault();
    setSettingsMsg('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday.date)) {
      setSettingsMsg('Chhutti ki date chuniye.');
      return;
    }
    try {
      const d = await authFetch('/my-holidays', { method: 'POST', body: JSON.stringify({ holiday_date: newHoliday.date, reason: newHoliday.reason }) });
      setSettingsMsg(d.message);
      setNewHoliday({ date: '', reason: '' });
      await loadHolidays();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const deleteHoliday = async (id) => {
    try {
      await authFetch(`/my-holidays/${id}`, { method: 'DELETE' });
      await loadHolidays();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const addSlot = async (e) => {
    e.preventDefault();
    setSettingsMsg('');
    const v = newSlot.trim();
    if (!/^(0?[1-9]|1[0-2]):[0-5]\d\s*(AM|PM)$/i.test(v)) {
      setSettingsMsg('Time aise likhein: 10:30 AM ya 04:00 PM');
      return;
    }
    try {
      await authFetch('/my-slots', { method: 'POST', body: JSON.stringify({ time_slot: v }) });
      setNewSlot('');
      await loadSlots();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const addDefaultSlots = async () => {
    setSettingsMsg('');
    try {
      const d = await authFetch('/my-slots/defaults', { method: 'POST' });
      setSettingsMsg(d.message || 'Slots add ho gaye.');
      await loadSlots();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const toggleSlot = async (id) => {
    try {
      await authFetch(`/my-slots/${id}/toggle`, { method: 'PATCH' });
      await loadSlots();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const deleteSlot = async (id) => {
    if (!window.confirm('Ye slot hata dein?')) return;
    try {
      await authFetch(`/my-slots/${id}`, { method: 'DELETE' });
      await loadSlots();
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const saveHomeService = async () => {
    setSettingsMsg('');
    const charge = Number(homeSettings.charge);
    const radius = Number(homeSettings.radius);
    if (!Number.isFinite(charge) || charge < 0 || charge > 10000) {
      setSettingsMsg('Home service charge 0 se 10,000 ke beech ho.');
      return;
    }
    if (!Number.isInteger(radius) || radius < 1 || radius > 100) {
      setSettingsMsg('Radius 1 se 100 km ke beech poora number ho.');
      return;
    }
    try {
      const d = await authFetch('/home-service', {
        method: 'PATCH',
        body: JSON.stringify({ is_home_service: homeSettings.enabled, home_service_charge: charge, service_radius_km: radius })
      });
      setSettingsMsg(d.message || 'Home service settings save ho gayi.');
    } catch (err) {
      setSettingsMsg(err.message);
    }
  };

  const hideBooking = async (id) => {
    try {
      await authFetch(`/bookings/${id}/hide`, { method: 'PATCH' });
      setBookings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const clearFinished = async () => {
    if (!window.confirm('Saari Completed / Cancelled / Rejected bookings aapki list se hat jayengi. Earnings ka hisaab nahi badlega. Aage badhein?')) return;
    try {
      const d = await authFetch('/bookings/clear-finished', { method: 'POST' });
      setBookings(prev => prev.filter(b => !isFinishedStatus(b.status)));
      setNotice({ text: d.message || 'Hata di gayi.', wa: null });
    } catch (err) {
      alert(err.message);
    }
  };

  const updateBookingStatus = async (id, newStatus) => {
    if (updatingId !== null) return;
    if (newStatus === 'Rejected' && !window.confirm('Is booking ko reject karna hai? Customer ko bata diya jayega.')) return;
    if (newStatus === 'Cancelled' && !window.confirm('Is confirmed booking ko cancel karna hai? Customer ne payment kiya hai to poora refund jayega.')) return;

    setUpdatingId(id);
    setNotice(null);
    try {
      const user = JSON.parse(localStorage.getItem('groomax_user'));
      const token = user?.token || localStorage.getItem('token');

      const response = await fetch(`http://localhost:5000/api/owner/bookings/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: data.booking?.status || newStatus } : b));

        const n = data.notification || {};
        let msg = n.inApp ? 'Customer ko app me notification bhej di gayi.' : 'Status badal gaya, par app notification nahi ja payi.';
        if (n.sms === 'sent') msg += ' SMS bhi bhej diya gaya.';
        if (n.whatsapp === 'sent') msg += ' WhatsApp bhi bhej diya gaya.';
        const target = bookings.find(x => x.id === id);
        setNotice({
          text: `Booking #${id}: ${newStatus}. ${msg}`,
          wa: n.whatsapp !== 'sent' && target ? waUrl(target.phone, n.text) : null
        });
      } else {
        alert('Error: ' + (data.message || data.error || 'Status update nahi ho paya.'));
      }
    } catch (err) {
      console.error('Failed to update booking status:', err);
      alert('Server se connect nahi ho paya. Dobara try karein.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredBookings = bookings.filter(b => bookingFilter === 'All' ? true : b.status === bookingFilter);
  const completedBookings = bookings.filter(b => b.status === 'Completed' || b.status === 'Confirmed');
  const grossEarnings = stats ? Number(stats.gross) || 0 : completedBookings.reduce((sum, b) => sum + b.total, 0);
  const platformCommission = Math.round(grossEarnings * 0.10);
  const netSettlement = grossEarnings - platformCommission;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <div className="max-w-7xl mx-auto p-4 md:p-8">
          
          {loadError && (
            <div className="mb-6 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
              {loadError}
            </div>
          )}

          {/* Salon Banner & Approval Status Badge */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-amber-400">{salonDetails.name}</h1>
                
                <span className={`text-[10px] px-3 py-1 rounded-full font-bold border ${
                  salonDetails.approvalStatus === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                  salonDetails.approvalStatus === 'Pending' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                  'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  <i className="fa-solid fa-shield-halved mr-1"></i> ADMIN STATUS: {salonDetails.approvalStatus.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400"><i className="fa-solid fa-location-dot text-amber-400 mr-1"></i> {salonDetails.address || 'No address set yet.'}</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 flex flex-wrap gap-2 mb-8">
            {[
              { id: 'dashboard', label: 'Overview', icon: 'fa-chart-pie' },
              { id: 'bookings', label: 'Bookings Management', icon: 'fa-calendar-check' },
              { id: 'services', label: 'Services & Menu', icon: 'fa-list-check' },
              { id: 'profile', label: 'Salon Profile', icon: 'fa-store' },
              { id: 'settings', label: 'Slots & Home Service', icon: 'fa-clock' },
              { id: 'earnings', label: 'Earnings & Payouts', icon: 'fa-wallet' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === tab.id ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                  <p className="text-xs text-slate-400 mb-1">Total Bookings</p>
                  <p className="text-2xl font-black text-amber-400">{stats ? stats.total_bookings : bookings.length}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                  <p className="text-xs text-slate-400 mb-1">Pending Requests</p>
                  <p className="text-2xl font-black text-amber-400">{bookings.filter(b => b.status === 'Pending').length}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                  <p className="text-xs text-slate-400 mb-1">Active Services</p>
                  <p className="text-2xl font-black text-indigo-400">{services.filter(s => s.active).length}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                  <p className="text-xs text-slate-400 mb-1">Net Earnings</p>
                  <p className="text-2xl font-black text-emerald-400">₹{netSettlement}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOOKINGS MANAGEMENT */}
          {activeTab === 'bookings' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-calendar-check text-amber-400"></i> Appointment Bookings
              </h3>

              <div className="flex flex-wrap gap-2 mb-4">
                {['All', 'Pending', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setBookingFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold cursor-pointer ${
                      bookingFilter === f
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {f} ({f === 'All' ? bookings.length : bookings.filter(b => b.status === f).length})
                  </button>
                ))}
              </div>

              {notice && (
                <div className="mb-4 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
                  {notice.text}
                  {notice.wa && (
                    <>
                      {' '}
                      <a href={notice.wa} target="_blank" rel="noopener noreferrer" className="underline font-bold text-emerald-300">
                        WhatsApp par bhi bhejein
                      </a>
                    </>
                  )}
                </div>
              )}

              {bookings.some(b => isFinishedStatus(b.status)) && (
                <div className="mb-4 flex justify-end">
                  <button onClick={clearFinished} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-rose-500/40 cursor-pointer">
                    Saari finished bookings hatayein
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {filteredBookings.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No bookings found.</p>
                ) : (
                  filteredBookings.map((b) => (
                    <div key={b.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{b.customerName}</span>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                            b.status === 'Confirmed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                            b.status === 'Completed' ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' :
                            b.status === 'Pending' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                            'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}>
                            {b.status}
                          </span>
                          <span className="text-xs bg-slate-900 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-md font-mono">
                            {b.slot} ({b.date || 'date nahi'})
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{b.service} • ₹{b.total} • {b.visitType} • Booking #{b.id}{b.paymentStatus ? ` • Payment: ${b.paymentStatus}` : ''}</p>
                        {b.phone && (
                          <p className="text-xs text-slate-400 mt-1">
                            <i className="fa-solid fa-phone text-amber-400 mr-1"></i>
                            <a href={`tel:${b.phone}`} className="text-amber-400 hover:underline">{b.phone}</a>
                          </p>
                        )}
                        {b.visitType === 'Home Service' && b.address && (
                          <p className="text-xs text-slate-400 mt-1 break-words">
                            <i className="fa-solid fa-house-user text-amber-400 mr-1"></i> Customer ka address: {b.address}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {b.status === 'Pending' && (
                          <>
                            <button disabled={updatingId !== null} onClick={() => updateBookingStatus(b.id, 'Confirmed')} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Accept</button>
                            <button disabled={updatingId !== null} onClick={() => updateBookingStatus(b.id, 'Rejected')} className="px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Reject</button>
                          </>
                        )}
                        {b.status === 'Confirmed' && (
                          <button disabled={updatingId !== null} onClick={() => updateBookingStatus(b.id, 'Completed')} className="px-4 py-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            Mark Completed
                          </button>
                        )}
                        {b.status === 'Confirmed' && (
                          <button disabled={updatingId !== null} onClick={() => updateBookingStatus(b.id, 'Cancelled')} className="px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            Cancel
                          </button>
                        )}
                        {b.phone && waUrl(b.phone, `Groo Max: Booking #${b.id} (${b.service}, ${b.date} ${b.slot}) ke baare me.`) && (
                          <a href={waUrl(b.phone, `Groo Max: Booking #${b.id} (${b.service}, ${b.date} ${b.slot}) ke baare me.`)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold">
                            WhatsApp
                          </a>
                        )}
                        {isFinishedStatus(b.status) && (
                          <button onClick={() => hideBooking(b.id)} className="px-3 py-2 bg-slate-900 text-slate-400 border border-slate-700 rounded-xl text-xs font-bold cursor-pointer">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SERVICES & PRICING MENU */}
          {activeTab === 'services' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-md font-bold text-amber-400 mb-4">Add New Service</h3>
                <form onSubmit={handleAddService} className="space-y-3">
                  <input type="text" placeholder="Service Name" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                  <input type="number" placeholder="Price (₹)" value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                  <input type="text" placeholder="Duration (e.g. 30 mins)" value={newService.duration} onChange={(e) => setNewService({ ...newService, duration: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                  <button type="submit" className="w-full bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl hover:bg-amber-400 text-xs cursor-pointer">Add Service</button>
                </form>
              </div>

              <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-md font-bold text-slate-100 mb-4">Active Services Menu ({services.length})</h3>
                <div className="space-y-2">
                  {services.map((s) => (
                    <div key={s.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-200">{s.name}</p>
                        <p className="text-[10px] text-slate-500">{s.duration}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black text-amber-400">₹{s.price}</span>
                        <button onClick={() => toggleServiceActive(s.id)} className="text-xs text-amber-400 cursor-pointer">
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => deleteService(s.id)} className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer">
                          <i className="fa-solid fa-trash"></i> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SALON PROFILE EDIT */}
          {activeTab === 'profile' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl">
              <h3 className="text-lg font-bold text-amber-400 mb-4">Edit Salon Details & Profile</h3>
              <form onSubmit={handleUpdateSalonProfile} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Salon Name</label>
                  <input type="text" value={salonDetails.name} onChange={(e) => setSalonDetails({ ...salonDetails, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Lucknow Area / Zone</label>
                  <input type="text" value={salonDetails.area} onChange={(e) => setSalonDetails({ ...salonDetails, area: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Full Shop Address</label>
                  <input type="text" value={salonDetails.address} onChange={(e) => setSalonDetails({ ...salonDetails, address: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Opening Hours</label>
                  <input type="text" value={salonDetails.openingHours} onChange={(e) => setSalonDetails({ ...salonDetails, openingHours: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
                </div>
                <button type="submit" className="w-full bg-amber-500 text-slate-950 font-bold py-3 rounded-xl hover:bg-amber-400 text-xs cursor-pointer">
                  Save Salon Profile Changes
                </button>
              </form>
            </div>
          )}

          {/* TAB: SLOTS & HOME SERVICE */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {settingsMsg && (
                <div className="md:col-span-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                  {settingsMsg}
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-house-user text-amber-400"></i> Home Service
                </h3>
                <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={homeSettings.enabled}
                    onChange={(e) => setHomeSettings({ ...homeSettings, enabled: e.target.checked })}
                  />
                  Home service {homeSettings.enabled ? 'ON hai' : 'OFF hai'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-400">
                    Extra charge (₹)
                    <input
                      type="number" min="0" max="10000"
                      value={homeSettings.charge}
                      onChange={(e) => setHomeSettings({ ...homeSettings, charge: e.target.value })}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Radius (km)
                    <input
                      type="number" min="1" max="100"
                      value={homeSettings.radius}
                      onChange={(e) => setHomeSettings({ ...homeSettings, radius: e.target.value })}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                </div>
                <button onClick={saveHomeService} className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold cursor-pointer">
                  Save Home Service
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-clock text-amber-400"></i> Time Slots
                </h3>
                <p className="text-[11px] text-slate-500">Customer sirf yahi slots booking page par dekhega. Slot par click karke ON/OFF karein.</p>
                {slotList.length === 0 ? (
                  <p className="text-xs text-rose-400">Abhi koi slot nahi hai, isliye customer booking nahi kar sakta.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slotList.map((sl) => (
                      <span key={sl.id} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
                        sl.is_active ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-500 line-through'
                      }`}>
                        <button onClick={() => toggleSlot(sl.id)} className="cursor-pointer" title="ON/OFF">{sl.time_slot}</button>
                        <button onClick={() => deleteSlot(sl.id)} className="text-rose-400 cursor-pointer" title="Hatayein" aria-label={`Slot ${sl.time_slot} hatayein`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <form onSubmit={addSlot} className="flex gap-2">
                  <input
                    value={newSlot}
                    onChange={(e) => setNewSlot(e.target.value)}
                    placeholder="10:30 AM"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                  <button type="submit" className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold cursor-pointer">Add</button>
                </form>
                <button onClick={addDefaultSlots} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 cursor-pointer">
                  Default slots (10 AM - 7 PM, har ghante)
                </button>
              </div>

              <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-umbrella-beach text-amber-400"></i> Chhutti (Holidays)
                </h3>
                <p className="text-[11px] text-slate-500">Is din customer booking nahi kar payega. Pehle se lagi bookings ko aapko khud cancel / reject karna hoga.</p>
                {holidays.length === 0 ? (
                  <p className="text-xs text-slate-500">Abhi koi chhutti nahi lagi.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {holidays.map((h) => (
                      <span key={h.id} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-rose-500/30 text-rose-300">
                        {h.holiday_date}{h.reason ? ` (${h.reason})` : ''}
                        <button onClick={() => deleteHoliday(h.id)} className="text-slate-300 cursor-pointer" aria-label={`Chhutti ${h.holiday_date} hatayein`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <form onSubmit={addHoliday} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="date"
                    aria-label="Chhutti ki date"
                    value={newHoliday.date}
                    onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                  <input
                    aria-label="Chhutti ka kaaran"
                    value={newHoliday.reason}
                    onChange={(e) => setNewHoliday({ ...newHoliday, reason: e.target.value })}
                    placeholder="Kaaran (jaise Diwali)"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                  <button type="submit" className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold cursor-pointer">Chhutti lagayein</button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: EARNINGS & SETTLEMENTS */}
          {activeTab === 'earnings' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <p className="text-xs text-slate-400 mb-1">Gross Revenue</p>
                <p className="text-3xl font-black text-amber-400">₹{grossEarnings}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <p className="text-xs text-slate-400 mb-1">Platform Fee (10%)</p>
                <p className="text-3xl font-black text-rose-400">-₹{platformCommission}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <p className="text-xs text-slate-400 mb-1">Net Settlement</p>
                <p className="text-3xl font-black text-emerald-400">₹{netSettlement}</p>
              </div>
            </div>
          )}

        </div>
      </div>

      <Footer />
    </div>
  );
}
