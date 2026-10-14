import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-10 mt-16">
      <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Brand Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-black text-lg">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center text-sm">
              <i className="fa-solid fa-scissors rotate-45"></i>
            </div>
            <span>GROO MAX</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Lucknow's premier multi-vendor salon booking platform. Seamless online slot booking, doorstep home services, and transparent reviews across Gomti Nagar, Hazratganj, Alambagh & Aminabad.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="font-bold text-slate-100 text-sm mb-3">Quick Navigation</h4>
          <ul className="space-y-2 text-[11px]">
            <li><button onClick={() => navigate('/customer')} className="hover:text-amber-400 transition">Explore Lucknow Salons</button></li>
            <li><button onClick={() => navigate('/customer/bookings')} className="hover:text-amber-400 transition">My Appointments History</button></li>
            <li><button onClick={() => navigate('/customer/reviews')} className="hover:text-amber-400 transition">Write & View Reviews</button></li>
            <li><button onClick={() => navigate('/profile')} className="hover:text-amber-400 transition">My Profile Settings</button></li>
          </ul>
        </div>

        {/* Portals Access */}
        <div>
          <h4 className="font-bold text-slate-100 text-sm mb-3">Role Portals</h4>
          <ul className="space-y-2 text-[11px]">
            <li><button onClick={() => navigate('/auth')} className="hover:text-amber-400 transition">Customer Account</button></li>
            <li><button onClick={() => navigate('/auth')} className="hover:text-amber-400 transition">Salon Owner Partner Portal</button></li>
            <li><button onClick={() => navigate('/auth')} className="hover:text-amber-400 transition">Super Admin Control Panel</button></li>
          </ul>
        </div>

        {/* Coverage Areas */}
        <div>
          <h4 className="font-bold text-slate-100 text-sm mb-3">Lucknow Coverage Areas</h4>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Gomti Nagar • Hazratganj • Alambagh • Aminabad • Indira Nagar • Gomti Nagar Extension
          </p>
          <div className="mt-4 flex gap-3 text-slate-400 text-sm">
            <i className="fa-brands fa-instagram hover:text-amber-400 cursor-pointer transition"></i>
            <i className="fa-brands fa-facebook hover:text-amber-400 cursor-pointer transition"></i>
            <i className="fa-brands fa-whatsapp hover:text-amber-400 cursor-pointer transition"></i>
          </div>
        </div>

      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-500">
        <p>© 2026 GROO MAX Lucknow. All Rights Reserved.</p>
        <p className="mt-2 sm:mt-0 font-medium">Crafted with ❤️ by Koders Studio</p>
      </div>
    </footer>
  );
}