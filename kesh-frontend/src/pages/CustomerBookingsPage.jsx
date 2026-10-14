import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiBookings } from '../services/apiService';

export default function CustomerBookingsPage() {
  const navigate = useNavigate();
  const [filterTab, setFilterTab] = useState('All'); // All | Upcoming | Completed | Cancelled
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const data = await apiBookings.getUserBookings();
        setBookings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  const handleCancelBooking = async (id) => {
    if (window.confirm('Are you sure you want to cancel this booking? Refund will be processed as per policy.')) {
      setBookings(bookings.map(b => b.id === id ? { ...b, status: 'Cancelled' } : b));
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (filterTab === 'All') return true;
    return b.status === filterTab;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-amber-400">My Salon Appointments</h1>
            <p className="text-xs text-slate-400">View upcoming bookings, cancel/reschedule, or submit reviews[cite: 18].</p>
          </div>
          
          {/* Status Filters (Section 11) */}
          <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex gap-1 text-xs">
            {['All', 'Confirmed', 'Completed', 'Cancelled'].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 font-bold rounded-xl transition cursor-pointer ${
                  filterTab === tab ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'Confirmed' ? 'Upcoming' : tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl text-center text-slate-400 text-xs">
            <i className="fa-solid fa-spinner animate-spin text-amber-400 text-xl mb-2"></i>
            <p>Loading appointments...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl text-center text-slate-400 text-xs">
            No bookings found in "{filterTab}" state.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((b) => (
              <div key={b.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-slate-100 text-base">{b.salonName}</h3>
                    <span className="text-[10px] bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-0.5 rounded-full">
                      {b.area || 'Lucknow'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-400 font-bold mb-2">{b.serviceName} • ₹{b.price}</p>
                  <p className="text-xs text-slate-400">
                    <i className="fa-solid fa-calendar text-amber-400 mr-1.5"></i> {b.date} at {b.slot}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Reference ID: {b.id}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-xs px-3.5 py-1.5 rounded-xl font-bold border ${
                    b.status === 'Confirmed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                    b.status === 'Completed' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' :
                    'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}>
                    {b.status}
                  </span>

                  {b.status === 'Confirmed' && (
                    <button 
                      onClick={() => handleCancelBooking(b.id)}
                      className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer"
                    >
                      Cancel Booking
                    </button>
                  )}

                  {b.status === 'Completed' && (
                    <button 
                      onClick={() => navigate('/customer/reviews')}
                      className="text-xs bg-amber-500 text-slate-950 hover:bg-amber-400 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                    >
                      Write Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}