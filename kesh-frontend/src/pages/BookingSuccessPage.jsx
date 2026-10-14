import React from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function BookingSuccessPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const salon = searchParams.get('salon');
  const amount = searchParams.get('amount');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            <i className="fa-solid fa-check"></i>
          </div>

          <h1 className="text-2xl font-black text-slate-100 mb-1">Appointment Confirmed!</h1>
          <p className="text-xs text-slate-400 mb-6">Booking ID: <span className="font-mono text-amber-400">{id}</span></p>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xs text-left space-y-2 mb-6">
            <p><span className="text-slate-500">Salon:</span> <strong className="text-slate-200">{salon}</strong></p>
            <p><span className="text-slate-500">Paid Amount:</span> <strong className="text-emerald-400">₹{amount}</strong></p>
            <p><span className="text-slate-500">Status:</span> <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">Confirmed</span></p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('/profile')} className="flex-1 bg-slate-800 border border-slate-700 text-amber-400 py-3 rounded-xl text-xs font-bold">View My Bookings</button>
            <button onClick={() => navigate('/customer')} className="flex-1 bg-amber-500 text-slate-950 py-3 rounded-xl text-xs font-bold">Back To Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}