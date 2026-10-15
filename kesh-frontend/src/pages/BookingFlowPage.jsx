import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiBookings } from '../services/apiService';

// Strict positive integer parser.
// 2 ya "2" -> 2. Ye sab null dete hain: "", "abc", "2abc", "2-3", 0, -1, 1.5, null, undefined
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

// URL param "2" ya "salon-2" dono chalega, baaki sab invalid
const parseSalonRouteId = (value) => {
  if (typeof value !== 'string') return null;
  return parseId(value.replace(/^salon-/, ''));
};

// '10:00 AM' jaise slots ko time ke hisaab se sort karne ke liye
const slotMinutes = (slot) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot || ''));
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
};
const sortSlots = (list) => [...list].sort((a, b) => slotMinutes(a) - slotMinutes(b));

// Aaj ki date (local time) YYYY-MM-DD me
const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function BookingFlowPage() {
  const { salonId } = useParams();
  const [searchParams] = useSearchParams();
  const serviceId = searchParams.get('serviceId');
  const navigate = useNavigate();

  // Salon aur service sirf live database se aate hain. Koi mock ya default fallback nahi.
  const [salon, setSalon] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Wizard Steps State
  const [step, setStep] = useState(1);
  const [bookingDate, setBookingDate] = useState(todayStr());
  const [selectedSlot, setSelectedSlot] = useState('');
  const [serviceType, setServiceType] = useState('salon_visit'); // schema me 'salon_visit' ya 'doorstep' hai
  const [address, setAddress] = useState('');

  // Slots salon owner ke apne set kiye hue hain (database se). Koi hardcoded list nahi.
  const [salonSlots, setSalonSlots] = useState([]);   // salon API se (bina "booked" nishan ke)
  const [slots, setSlots] = useState([]);             // is date ke liye: [{ time_slot, available, booked, past }]
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsVersion, setSlotsVersion] = useState(0);

  // Database se live salon aur service fetch karna
  useEffect(() => {
    let cancelled = false;

    // Salon badalte hi purana salon, service aur slot saaf karo, taaki purane salon ka data na bache
    setSalon(null);
    setSelectedService(null);
    setLoadError('');
    setStep(1);
    setSelectedSlot('');

    const urlSalonId = parseSalonRouteId(salonId);
    const urlServiceId = parseId(serviceId);

    if (urlSalonId === null) {
      setLoadError('Salon ka link galat hai. Salon page se dobara try karein.');
      return undefined;
    }
    if (urlServiceId === null) {
      setLoadError('Service select nahi hui. Salon page se service chunkar aayein.');
      return undefined;
    }

    const fetchLiveSalon = async () => {
      try {
        const res = await fetch(`https://groomax-backend.onrender.com/api/salons/${urlSalonId}`);
        const result = await res.json();
        if (cancelled) return;

        if (!res.ok || !result.success || !result.data) {
          setLoadError('Salon load nahi ho paya. Dobara try karein.');
          return;
        }

        // API ka response flat hai: salon ke fields aur services seedhe result.data me hain.
        // Purana nested shape (result.data.salon) bhi chalega.
        const s = result.data.salon || result.data;
        const services = result.data.services || s.services || [];

        // Response me salon ki id ho to wo URL wali hi honi chahiye
        const rawId = s.id ?? s.salon_id;
        const returnedId = rawId === undefined || rawId === null ? urlSalonId : parseId(rawId);
        if (returnedId !== urlSalonId) {
          setLoadError('Salon ka data match nahi hua. Dobara try karein.');
          return;
        }

        const foundSrv = services.find((srv) => parseId(srv.id) === urlServiceId);
        if (!foundSrv) {
          setLoadError('Ye service is salon me nahi mili. Salon page se dobara chunein.');
          return;
        }
        // Service isi salon ki honi chahiye
        if (foundSrv.salon_id !== undefined && parseId(foundSrv.salon_id) !== urlSalonId) {
          setLoadError('Ye service is salon ki nahi hai. Salon page se dobara chunein.');
          return;
        }

        setSalon({
          id: urlSalonId,
          name: s.salon_name,
          homeServiceAvailable: s.is_home_service,
          homeServiceCharge: Number(s.home_service_charge || 0)
        });
        setSelectedService({
          id: parseId(foundSrv.id),
          name: foundSrv.name,
          price: Number(foundSrv.price)
        });

        // Salon response me slots ho to wo fallback ke taur par (availability route na chale to)
        const rawSlots = result.data.slots || s.slots || [];
        setSalonSlots(
          rawSlots
            .filter((x) => typeof x === 'string' || x.is_active !== false)
            .map((x) => (typeof x === 'string' ? x : x.time_slot))
            .filter(Boolean)
        );
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching salon for booking:', err);
        setLoadError('Server se connect nahi ho paya. Dobara try karein.');
      }
    };

    fetchLiveSalon();
    return () => {
      cancelled = true;
    };
  }, [salonId, serviceId]);

  // Chuni hui date ke liye slots: owner ke slots, jo book ho chuke ya nikal chuke wo band
  useEffect(() => {
    if (!salon) return undefined;
    let cancelled = false;
    setSlotsLoading(true);

    (async () => {
      let list;
      try {
        list = await apiBookings.getAvailability(salon.id, bookingDate);
      } catch (err) {
        // Availability route server.js me mount nahi hua ho to salon ke slots dikhao. Server fir bhi double booking rokta hai.
        list = sortSlots(salonSlots).map((time_slot) => ({ time_slot, available: true, booked: false, past: false }));
      }
      if (cancelled) return;
      setSlots(list);
      setSelectedSlot((prev) => (list.some((s) => s.time_slot === prev && s.available) ? prev : ''));
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [salon, bookingDate, salonSlots, slotsVersion]);

  const totalAmount = salon && selectedService
    ? (serviceType === 'doorstep'
        ? selectedService.price + (salon.homeServiceCharge || 0)
        : selectedService.price)
    : 0;

  // Final Submit Handler (Backend Booking POST Request)
  const handleFinalSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submitting) return;

    if (!salon || !selectedService) {
      alert('Salon ya service load nahi hui. Page dobara kholein.');
      return;
    }

    // salon_id sirf URL aur live salon object se, strict numeric. Koi fallback nahi.
    const urlSalonId = parseSalonRouteId(salonId);
    const liveSalonId = parseId(salon.id);
    if (urlSalonId === null || liveSalonId === null || urlSalonId !== liveSalonId) {
      alert('Salon pehchana nahi ja saka, isliye booking nahi ho sakti. Salon page par wapas jaakar dobara try karein.');
      return;
    }

    const cleanServiceId = parseId(selectedService.id);
    if (cleanServiceId === null) {
      alert('Service valid nahi hai. Salon page se dobara service chunein.');
      return;
    }

    if (!selectedSlot) {
      alert('Kripya time slot select kijiye!');
      return;
    }
    if (!bookingDate || bookingDate < todayStr()) {
      alert('Kripya aaj ya aane wali date chuniye.');
      return;
    }
    if (serviceType === 'doorstep' && !address.trim()) {
      alert('Doorstep home service ke liye address bharna zaroori hai!');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiBookings.createBooking({
        salon_id: liveSalonId,
        service_id: cleanServiceId,
        service_name: selectedService.name,
        time_slot: selectedSlot,
        booking_date: bookingDate,
        service_type: serviceType,
        address: address.trim() || null,
        total_price: totalAmount
      });

      if (response.booking && response.booking.id) {
        const bookingId = response.booking.id;
        navigate(`/customer/payment/${bookingId}?salon=${encodeURIComponent(salon.name)}&amount=${totalAmount}`);
      } else {
        alert('Booking error: ' + (response.error || 'Failed to create booking'));
      }
    } catch (err) {
      console.error('Booking submission failed:', err);
      alert(err.message || 'Server error during booking.');
      setSlotsVersion((v) => v + 1); // slot kisi aur ne le liya ho to list taaza karo
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Navbar />
        <div className="max-w-3xl mx-auto p-8 text-center">
          <p className="text-sm text-red-400 mb-6">{loadError}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="bg-slate-900 border border-slate-800 text-slate-300 px-6 py-3 rounded-2xl text-xs cursor-pointer"
          >
            ← Wapas jaayein
          </button>
        </div>
      </div>
    );
  }

  if (!salon || !selectedService) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Navbar />
        <div className="max-w-3xl mx-auto p-8 text-center text-xs text-slate-400">Salon load ho raha hai...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <div className="max-w-3xl mx-auto p-4 md:p-8">

        {/* Progress Wizard Bar */}
        <div className="flex items-center justify-between mb-8 text-xs font-bold bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <span className={step >= 1 ? 'text-amber-400' : 'text-slate-600'}>1. Date & Slot</span>
          <i className="fa-solid fa-chevron-right text-slate-700"></i>
          <span className={step >= 2 ? 'text-amber-400' : 'text-slate-600'}>2. Service Type</span>
          <i className="fa-solid fa-chevron-right text-slate-700"></i>
          <span className={step >= 3 ? 'text-amber-400' : 'text-slate-600'}>3. Summary & Pay</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">

          {/* STEP 1: DATE & SLOT */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-1">Select Appointment Date & Time</h2>
              <p className="text-xs text-slate-400 mb-6">{salon.name} • {selectedService.name} (₹{selectedService.price})</p>

              <label className="block text-xs font-semibold text-slate-300 mb-2">Select Date:</label>
              <input
                type="date"
                value={bookingDate}
                min={todayStr()}
                onChange={(e) => setBookingDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-xs mb-6 w-full focus:outline-none focus:border-amber-500"
              />

              <label className="block text-xs font-semibold text-slate-300 mb-2">Available Time Slots:</label>
              {slotsLoading ? (
                <p className="text-xs text-slate-400 mb-8">Slots load ho rahe hain...</p>
              ) : slots.length === 0 ? (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-8">
                  {slots.holiday
                    ? `Salon is din band rahega${slots.reason ? ` (${slots.reason})` : ''}. Dusri date chuniye.`
                    : 'Is salon ne abhi time slots set nahi kiye. Salon se baat karein ya baad me try karein.'}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s.time_slot}
                        disabled={!s.available}
                        onClick={() => setSelectedSlot(s.time_slot)}
                        className={`py-3 text-xs font-bold rounded-xl border transition ${
                          !s.available
                            ? 'bg-slate-950 border-slate-900 text-slate-600 line-through cursor-not-allowed'
                            : selectedSlot === s.time_slot
                              ? 'bg-amber-500 text-slate-950 border-amber-500 cursor-pointer'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                        }`}
                      >
                        {s.time_slot}
                        {!s.available && (
                          <span className="block text-[9px] font-normal no-underline">{s.booked ? 'Booked' : 'Nikal gaya'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {slots.every((s) => !s.available) && (
                    <p className="text-xs text-slate-500 mb-2">Is din ke saare slots bhar gaye hain. Dusri date chuniye.</p>
                  )}
                  <div className="mb-6"></div>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!selectedSlot) alert('Kripya time slot select karein!');
                  else setStep(2);
                }}
                className="w-full bg-amber-500 text-slate-950 font-bold py-3.5 rounded-2xl text-xs hover:bg-amber-400 transition cursor-pointer"
              >
                Next: Select Visit Type →
              </button>
            </div>
          )}

          {/* STEP 2: SALON VISIT vs DOORSTEP */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">Where do you want the service?</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div
                  onClick={() => setServiceType('salon_visit')}
                  className={`p-5 rounded-2xl border cursor-pointer text-center transition ${
                    serviceType === 'salon_visit' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <i className="fa-solid fa-store text-2xl mb-2"></i>
                  <p className="font-bold text-xs">Salon Visit</p>
                  <p className="text-[10px] text-slate-500 mt-1">Visit shop at scheduled time</p>
                </div>

                {salon.homeServiceAvailable && (
                  <div
                    onClick={() => setServiceType('doorstep')}
                    className={`p-5 rounded-2xl border cursor-pointer text-center transition ${
                      serviceType === 'doorstep' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <i className="fa-solid fa-house-user text-2xl mb-2"></i>
                    <p className="font-bold text-xs">Home Service</p>
                    <p className="text-[10px] text-slate-500 mt-1">+₹{salon.homeServiceCharge} Visit Charge</p>
                  </div>
                )}
              </div>

              {serviceType === 'doorstep' && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Enter Lucknow Address:</label>
                  <textarea
                    rows={3}
                    placeholder="House No., Street, Area in Lucknow..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex gap-4">
                <button type="button" onClick={() => setStep(1)} className="w-1/3 bg-slate-950 border border-slate-800 text-slate-300 py-3 rounded-2xl text-xs cursor-pointer">← Back</button>
                <button type="button" onClick={() => setStep(3)} className="w-2/3 bg-amber-500 text-slate-950 font-bold py-3 rounded-2xl text-xs cursor-pointer">Next: Review & Pay →</button>
              </div>
            </div>
          )}

          {/* STEP 3: SUMMARY & PAY */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-4">Booking Price Breakdown</h2>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl mb-6 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400"><span>Salon:</span> <strong className="text-slate-200">{salon.name}</strong></div>
                <div className="flex justify-between text-slate-400"><span>Service:</span> <strong className="text-slate-200">{selectedService.name}</strong></div>
                <div className="flex justify-between text-slate-400"><span>Date & Slot:</span> <strong className="text-amber-400">{bookingDate} at {selectedSlot}</strong></div>
                <div className="flex justify-between text-slate-400"><span>Visit Type:</span> <strong className="text-slate-200">{serviceType === 'doorstep' ? 'Doorstep Home Visit' : 'In-Store Visit'}</strong></div>
                <hr className="border-slate-800 my-2" />
                <div className="flex justify-between text-slate-300"><span>Base Price:</span> <span>₹{selectedService.price}</span></div>
                {serviceType === 'doorstep' && <div className="flex justify-between text-slate-300"><span>Home Visit Charge:</span> <span>₹{salon.homeServiceCharge}</span></div>}
                <div className="flex justify-between font-bold text-amber-400 text-sm pt-2"><span>Total Amount:</span> <span>₹{totalAmount}</span></div>
              </div>

              <div className="flex gap-4">
                <button type="button" onClick={() => setStep(2)} className="w-1/3 bg-slate-950 border border-slate-800 text-slate-300 py-3.5 rounded-2xl text-xs cursor-pointer">← Back</button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="w-2/3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-bold py-3.5 rounded-2xl text-xs shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  {submitting ? 'Booking ho rahi hai...' : `Confirm Booking & Pay ₹${totalAmount}`}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
