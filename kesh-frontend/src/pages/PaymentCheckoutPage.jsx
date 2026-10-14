import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiPayments } from '../services/apiService';

// Razorpay ki checkout script ek hi baar load hoti hai
const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay load nahi hua.')));
    s.onerror = () => reject(new Error('Payment window load nahi ho payi. Internet check karke dobara try karein.'));
    document.body.appendChild(s);
  });

export default function PaymentCheckoutPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('online'); // online | pay_at_salon
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, c] = await Promise.all([apiPayments.getSummary(bookingId), apiPayments.getConfig()]);
        if (cancelled) return;
        setBooking(b);
        setConfig(c);
        // Online chalu na ho (production me bina gateway) to salon par payment hi ek raasta hai
        if (c.provider === 'none' && !c.testModeAllowed) setPaymentMethod('pay_at_salon');
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Booking load nahi ho payi.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const goSuccess = (b) =>
    navigate(
      `/customer/booking-success/${bookingId}?salon=${encodeURIComponent(b.salonName)}&amount=${b.total}&status=Pending`
    );

  const payOnline = async () => {
    const order = await apiPayments.createOrder(bookingId);

    // Test mode: asli paisa nahi, bas poora flow check karne ke liye
    if (order.provider === 'none') {
      await apiPayments.testPay(bookingId);
      goSuccess(booking);
      return;
    }

    const Razorpay = await loadRazorpay();
    await new Promise((resolve) => {
      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Groo Max',
        description: `${booking.serviceName} - ${booking.salonName}`,
        theme: { color: '#f59e0b' },
        handler: async (resp) => {
          try {
            await apiPayments.verify({
              booking_id: Number(bookingId),
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature
            });
            goSuccess(booking);
          } catch (err) {
            setPaymentError(
              (err.message || 'Payment verify nahi hua.') + ' Paise kat gaye hon to booking number ke saath support ko batayein.'
            );
          }
          resolve();
        },
        modal: {
          ondismiss: () => {
            setPaymentError('Payment poora nahi hua. Paisa nahi kata. Dobara try kar sakte hain.');
            resolve();
          }
        }
      });
      rzp.on('payment.failed', (e) => {
        setPaymentError((e && e.error && e.error.description) || 'Payment fail ho gaya. Dobara try karein.');
      });
      rzp.open();
    });
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (isProcessing || !booking) return;
    setIsProcessing(true);
    setPaymentError('');
    try {
      if (paymentMethod === 'pay_at_salon') {
        await apiPayments.payAtSalon(bookingId);
        goSuccess(booking);
      } else {
        await payOnline();
      }
    } catch (err) {
      setPaymentError(err.message || 'Kuch galat ho gaya. Dobara try karein.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onlineAvailable = config && (config.provider === 'razorpay' || config.testModeAllowed);
  const isTest = config && config.provider === 'none' && config.testModeAllowed;
  const live = booking && ['pending', 'confirmed'].includes(String(booking.status).toLowerCase());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <button onClick={() => navigate('/profile')} className="text-xs text-slate-400 hover:text-amber-400 mb-6 flex items-center gap-1 cursor-pointer">
          <i className="fa-solid fa-arrow-left"></i> Meri bookings
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
          <h1 className="text-xl font-black text-amber-400 mb-1">Booking Payment</h1>
          <p className="text-xs text-slate-400 mb-6">
            Booking Reference: <span className="font-mono text-slate-200">#{bookingId}</span>
          </p>

          {loadError ? (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs">{loadError}</div>
          ) : !booking || !config ? (
            <p className="text-xs text-slate-400">
              <i className="fa-solid fa-spinner animate-spin mr-2"></i>Hisaab load ho raha hai...
            </p>
          ) : (
            <>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl mb-6 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400"><span>Salon:</span> <strong className="text-slate-200">{booking.salonName}</strong></div>
                <div className="flex justify-between text-slate-400"><span>Service:</span> <strong className="text-slate-200">{booking.serviceName}</strong></div>
                <div className="flex justify-between text-slate-400"><span>Date &amp; Time:</span> <strong className="text-slate-200">{booking.date} {booking.slot}</strong></div>
                <div className="flex justify-between text-slate-400">
                  <span>Visit Type:</span>
                  <strong className="text-amber-400">{booking.visitType === 'home' ? 'Doorstep Home Visit' : 'In-Store Salon Visit'}</strong>
                </div>
                <hr className="border-slate-800 my-2" />
                <div className="flex justify-between text-slate-300"><span>Service Fee:</span> <span>₹{booking.basePrice}</span></div>
                {booking.homeCharge > 0 && (
                  <div className="flex justify-between text-slate-300"><span>Home Travel Fee:</span> <span>₹{booking.homeCharge}</span></div>
                )}
                <div className="flex justify-between font-black text-emerald-400 text-base pt-2"><span>Total Payable:</span> <span>₹{booking.total}</span></div>
              </div>

              {booking.paid ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl text-xs">
                  <i className="fa-solid fa-circle-check mr-2"></i>Is booking ka payment ho chuka hai.
                  <button onClick={() => navigate('/profile')} className="block mt-3 underline cursor-pointer">Meri bookings dekhein</button>
                </div>
              ) : !live ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl text-xs">
                  Ye booking {booking.status} hai, ab payment nahi ho sakta.
                </div>
              ) : (
                <form onSubmit={handlePaymentSubmit}>
                  <label className="block text-xs font-bold text-slate-200 mb-3">Payment ka tareeka:</label>
                  <div className="space-y-2 mb-6">
                    {onlineAvailable && (
                      <div
                        onClick={() => setPaymentMethod('online')}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between text-xs ${
                          paymentMethod === 'online' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-3 font-semibold">
                          <i className="fa-solid fa-credit-card text-amber-400"></i>
                          {isTest ? 'Online payment (TEST MODE, asli paisa nahi katega)' : 'Online: UPI / Card / Net Banking'}
                        </span>
                        <input type="radio" aria-label="Online payment" checked={paymentMethod === 'online'} readOnly className="accent-amber-500" />
                      </div>
                    )}
                    <div
                      onClick={() => setPaymentMethod('pay_at_salon')}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between text-xs ${
                        paymentMethod === 'pay_at_salon' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-3 font-semibold">
                        <i className="fa-solid fa-money-bill-wave text-amber-400"></i> Salon par service ke baad paise dunga
                      </span>
                      <input type="radio" aria-label="Pay at salon" checked={paymentMethod === 'pay_at_salon'} readOnly className="accent-amber-500" />
                    </div>
                  </div>

                  {!onlineAvailable && (
                    <p className="text-[11px] text-slate-500 mb-4">Online payment abhi chalu nahi hai, isliye sirf salon par payment ka option hai.</p>
                  )}

                  {paymentError && (
                    <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                      <i className="fa-solid fa-circle-exclamation"></i> {paymentError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold py-4 rounded-2xl text-xs transition shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <i className="fa-solid fa-spinner animate-spin text-sm"></i>
                        <span>Ruko, payment ho raha hai...</span>
                      </>
                    ) : paymentMethod === 'pay_at_salon' ? (
                      <span>Booking pakki karein (payment salon par)</span>
                    ) : (
                      <>
                        <i className="fa-solid fa-lock"></i>
                        <span>Pay ₹{booking.total}</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-slate-500 text-center mt-4">
                    Cancel karne par refund ka niyam: appointment se 2 ghante pehle tak poora, uske baad aadha. Salon cancel kare to hamesha poora.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
