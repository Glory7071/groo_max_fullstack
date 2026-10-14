import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CustomerPortal from './pages/CustomerPortal';
import OwnerPanel from './pages/OwnerPanel';
import AdminPanel from './pages/AdminPanel';
import AuthPage from './pages/AuthPage';
import CustomerProfile from './pages/CustomerProfile';
import SalonDetailsPage from './pages/SalonDetailsPage';
import BookingFlowPage from './pages/BookingFlowPage';
import PaymentCheckoutPage from './pages/PaymentCheckoutPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import CustomerBookingsPage from './pages/CustomerBookingsPage';
import CustomerReviewsPage from './pages/CustomerReviewsPage';
import Navbar from './components/Navbar';

function ProtectedRoute({ children, allowedRole }) {
  const storedUser = JSON.parse(localStorage.getItem('groomax_user'));

  if (!storedUser) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRole && storedUser.role !== allowedRole && allowedRole !== 'any') {
    if (storedUser.role === 'customer') return <Navigate to="/customer" replace />;
  }

  return children;
}

function Home() {
  const navigate = useNavigate();
  const storedUser = JSON.parse(localStorage.getItem('groomax_user'));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-6">
          <i className="fa-solid fa-scissors text-slate-950 text-4xl rotate-45"></i>
        </div>
        
        <h1 className="text-5xl font-black text-amber-400 mb-2 tracking-tight">
          GROO MAX
        </h1>
        <p className="text-slate-400 max-w-md mb-8 text-xs font-medium">
          Lucknow's Premium Multi-Vendor Salon Booking Platform
        </p>

        {storedUser ? (
          <div className="mb-6 p-5 bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full">
            <p className="text-xs text-slate-400">Welcome Back,</p>
            <p className="font-bold text-amber-400 text-sm">{storedUser.name} ({storedUser.role.toUpperCase()})</p>
            <button 
              onClick={() => navigate(`/${storedUser.role}`)} 
              className="mt-3 w-full py-2.5 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 cursor-pointer"
            >
              Open My Portal ({storedUser.role.toUpperCase()})
            </button>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap justify-center mb-6">
            <button 
              onClick={() => navigate('/auth')}
              className="px-6 py-3 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer text-xs"
            >
              <i className="fa-solid fa-right-to-bracket"></i> Login / Register
            </button>
          </div>
        )}

        <button onClick={() => navigate('/customer')} className="text-slate-400 underline hover:text-amber-400 text-xs">
          Explore Salons in Lucknow →
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<AuthPage />} />
        
        {/* Customer Portal Routes Matching PDF Sections 5 to 13 */}
        <Route path="/customer" element={<CustomerPortal />} />
        <Route path="/customer/salon/:id" element={<SalonDetailsPage />} />
        <Route path="/customer/book/:salonId" element={<BookingFlowPage />} />
        <Route path="/customer/payment/:bookingId" element={<PaymentCheckoutPage />} />
        <Route path="/customer/booking-success/:id" element={<BookingSuccessPage />} />
        <Route path="/customer/bookings" element={<CustomerBookingsPage />} />
        <Route path="/customer/reviews" element={<CustomerReviewsPage />} />

        {/* Protected Panels */}
        <Route 
          path="/owner" 
          element={
            <ProtectedRoute allowedRole="owner">
              <OwnerPanel />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminPanel />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute allowedRole="any">
              <CustomerProfile />
            </ProtectedRoute>
          } 
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}