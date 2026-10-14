import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiReviews } from '../services/apiService';

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(x.getTime())
    ? String(d)
    : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function CustomerReviewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Sirf wahi booking jin par review diya ja sakta hai. Server se aati hain.
  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await apiReviews.getEligible();
        if (cancelled) return;
        setEligibleBookings(list);

        // Profile page se "Review likhein" dabane par seedha wahi booking khul jaye
        const wanted = Number(searchParams.get('booking'));
        const match = list.find((b) => b.booking_id === wanted);
        if (match) setSelectedBooking(match);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Bookings load nahi ho payi. Dobara login karke try karein.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (submitting || !selectedBooking) return;
    if (!comment.trim()) {
      alert('Kripya review text bharein.');
      return;
    }

    setSubmitting(true);
    try {
      await apiReviews.addReview({
        booking_id: selectedBooking.booking_id,
        rating,
        comment: comment.trim()
      });

      setSubmittedMessage(true);
      const doneId = selectedBooking.booking_id;
      setEligibleBookings((prev) => prev.filter((b) => b.booking_id !== doneId));

      setTimeout(() => {
        setSubmittedMessage(false);
        setSelectedBooking(null);
        setComment('');
        setRating(5);
      }, 2000);
    } catch (err) {
      alert(err.message || 'Review submit nahi ho paya. Dobara try karein.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-amber-400 flex items-center gap-2">
              <i className="fa-solid fa-star"></i> My Reviews & Feedback
            </h1>
            <p className="text-xs text-slate-400">Feedback submitted here will be visible on the public Salon page.</p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-amber-400 px-4 py-2 rounded-xl transition cursor-pointer"
          >
            ← My Profile
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8">
          <h2 className="text-md font-bold text-slate-100 mb-2 flex items-center gap-2">
            <i className="fa-solid fa-clipboard-check text-emerald-400"></i> Appointments Eligible For Review
          </h2>
          <p className="text-xs text-slate-400 mb-4">Appointment ki date aane ke baad, har booking par ek review de sakte ho.</p>

          {loading ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : loadError ? (
            <p className="text-xs text-red-400">{loadError}</p>
          ) : eligibleBookings.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Abhi koi booking review ke liye ready nahi hai. Appointment hone ke baad yahan dikhegi.
            </p>
          ) : (
            <div className="space-y-3">
              {eligibleBookings.map((b) => (
                <div key={b.booking_id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-200">{b.salon_name}</h4>
                    <p className="text-xs text-slate-400">{b.service_name} • {fmtDate(b.booking_date)}{b.time_slot ? ` at ${b.time_slot}` : ''}</p>
                  </div>
                  <button
                    onClick={() => setSelectedBooking(b)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <i className="fa-solid fa-pen"></i> Write Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review Submission Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setSelectedBooking(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>

            {submittedMessage ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                  <i className="fa-solid fa-check"></i>
                </div>
                <h3 className="text-lg font-bold text-slate-100">Review Published!</h3>
                <p className="text-xs text-slate-400 mt-1">Aapka review ab publically Salon details page par visible ho gaya hai.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview}>
                <h3 className="text-lg font-bold text-amber-400 mb-1">Rate Your Experience</h3>
                <p className="text-xs text-slate-400 mb-6">{selectedBooking.salon_name} ({selectedBooking.service_name})</p>

                <label className="block text-xs font-semibold text-slate-300 mb-2">Star Rating:</label>
                <div className="flex gap-2 mb-6">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition border cursor-pointer ${
                        star <= rating
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-600'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <label className="block text-xs font-semibold text-slate-300 mb-2">Write Review Message:</label>
                <textarea
                  rows={4}
                  required
                  maxLength={1000}
                  placeholder="Share details about haircut quality, ambiance, staff..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500 mb-6"
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-bold py-3 rounded-xl text-xs transition cursor-pointer"
                >
                  {submitting ? 'Publishing...' : 'Publish Public Review'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
