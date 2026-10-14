import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const storedUser = JSON.parse(localStorage.getItem('groomax_user'));

  const handleLogout = () => {
    localStorage.removeItem('groomax_user');
    setShowMenu(false);
    navigate('/auth');
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-bold flex items-center justify-center text-xl shadow-md shadow-amber-500/20">
              <i className="fa-solid fa-scissors rotate-45"></i>
            </div>
            <div>
              <span className="text-xl font-black text-amber-400 tracking-tight block leading-none">GROO MAX</span>
              <span className="text-[10px] text-slate-400 tracking-wider font-semibold">LUCKNOW SALONS</span>
            </div>
          </Link>

          {/* Quick Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-semibold">
            <Link to="/customer" className="text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5">
              <i className="fa-solid fa-compass"></i> Explore Salons
            </Link>

            {storedUser?.role === 'owner' && (
              <Link to="/owner" className="text-amber-400 hover:text-amber-300 transition flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                <i className="fa-solid fa-store"></i> Owner Dashboard
              </Link>
            )}

            {storedUser?.role === 'admin' && (
              <Link to="/admin" className="text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-lg">
                <i className="fa-solid fa-user-shield"></i> Admin Control
              </Link>
            )}
          </div>

          {/* User Profile / Auth Action */}
          <div className="relative">
            {storedUser ? (
              <div className="flex items-center gap-3">
               <button 
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  <div className="w-7 h-7 bg-amber-500 text-slate-950 font-bold rounded-lg flex items-center justify-center text-xs">
                    {(storedUser.full_name || storedUser.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-slate-200 leading-tight">{storedUser.full_name || storedUser.name}</p>
                    <p className="text-[10px] text-amber-400 font-semibold leading-none">{storedUser.role?.toUpperCase()}</p>
                  </div>
                  <i className="fa-solid fa-chevron-down text-slate-400 text-[10px]"></i>
                </button>

                {/* Dropdown Menu */}
                {showMenu && (
                  <div className="absolute right-0 top-12 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-800 sm:hidden">
                      <p className="text-xs font-bold text-slate-200">{storedUser.full_name || storedUser.name}</p>
                      <p className="text-[10px] text-amber-400">{storedUser.role?.toUpperCase()}</p>
                    </div>

                    <Link 
                      to="/profile" 
                      onClick={() => setShowMenu(false)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-amber-400 flex items-center gap-2"
                    >
                      <i className="fa-solid fa-id-card"></i> My Profile & History
                    </Link>

                    <Link 
                      to="/customer" 
                      onClick={() => setShowMenu(false)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-amber-400 flex items-center gap-2 md:hidden"
                    >
                      <i className="fa-solid fa-compass"></i> Explore Salons
                    </Link>

                    {storedUser.role === 'owner' && (
                      <Link 
                        to="/owner" 
                        onClick={() => setShowMenu(false)}
                        className="w-full text-left px-4 py-2 text-xs text-amber-400 hover:bg-slate-800 flex items-center gap-2 md:hidden"
                      >
                        <i className="fa-solid fa-store"></i> Owner Panel
                      </Link>
                    )}

                    {storedUser.role === 'admin' && (
                      <Link 
                        to="/admin" 
                        onClick={() => setShowMenu(false)}
                        className="w-full text-left px-4 py-2 text-xs text-indigo-400 hover:bg-slate-800 flex items-center gap-2 md:hidden"
                      >
                        <i className="fa-solid fa-user-shield"></i> Admin Panel
                      </Link>
                    )}

                    <div className="border-t border-slate-800 my-1"></div>

                    <button 
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer font-semibold"
                    >
                      <i className="fa-solid fa-right-from-bracket"></i> Logout Account
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={() => navigate('/auth')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-right-to-bracket"></i> Login / Register
              </button>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}