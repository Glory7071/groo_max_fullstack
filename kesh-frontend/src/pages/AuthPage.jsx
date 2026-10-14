import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiAuth } from '../services/apiService';

export default function AuthPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('customer'); // register ke liye: customer | owner (admin kabhi nahi)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // 1. formData state me salon fields jodo:
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    salonName: '',   // Naya field owner ke liye
    salonAddress: '' // Naya field owner ke liye
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const calculatePasswordStrength = (pass) => {
    let score = 0;
    if (!pass) return { score: 0, label: '', color: 'bg-slate-800' };
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 25, label: 'Weak', color: 'bg-rose-500', text: 'text-rose-400' };
    if (score === 2 || score === 3) return { score: 65, label: 'Medium', color: 'bg-amber-500', text: 'text-amber-400' };
    return { score: 100, label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-400' };
  };

  const strength = calculatePasswordStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!isLogin) {
      if (!formData.name.trim()) {
        setError('Kripya apna poora naam bharein.');
        return;
      }

      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(formData.phone)) {
        setError('Kripya valid 10-digit mobile number enter karein.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setError('Kripya sahi email address enter karein.');
        return;
      }

      if (formData.password.length < 8 || !/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password)) {
        setError('Password kam se kam 8 characters ka ho, usme letters aur numbers hon.');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError('Password aur Confirm Password match nahi ho rahe hain!');
        return;
      }
    }

    setLoading(true);

    try {
      if (!isLogin) {
        const reg = await apiAuth.register(formData.name, formData.email, formData.password, role, formData.phone, formData.salonName, formData.salonAddress);
        if (reg.success) {
          setIsLogin(true);
          setFormData((f) => ({ ...f, password: '', confirmPassword: '' }));
          setError('');
          setNotice(role === 'owner'
            ? 'Registration ho gaya. Admin approval ke baad aapka salon customers ko dikhega. Ab login karein.'
            : 'Registration ho gaya. Ab login karein.');
        }
        setLoading(false);
        return;
      }

      const res = await apiAuth.login(formData.email, formData.password);
      if (res.success) {
        // Role SERVER se aata hai (token ke peeche DB). UI ka chuna hua tab kuch decide nahi karta.
        sessionStorage.setItem('groomax_user', JSON.stringify(res.user));
        localStorage.setItem('groomax_user', JSON.stringify(res.user)); // sirf display ke liye
        const r = res.user.role;
        if (r === 'admin') navigate('/admin');
        else if (r === 'salon_owner') navigate('/owner');
        else navigate('/customer');
      }
    } catch (err) {
      setError(err.message || 'Authentication error aaya, kripya dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    // Abhi backend par reset-email system nahi hai; jhoota "success" nahi dikhate.
    setForgotSuccess(true);
    setTimeout(() => {
      setForgotSuccess(false);
      setForgotModal(false);
      setForgotEmail('');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative my-8">
        
        <button 
          onClick={() => navigate('/')}
          className="absolute top-6 right-6 text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1 transition"
        >
          <i className="fa-solid fa-arrow-left"></i> Home
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-bold flex items-center justify-center text-xl mx-auto mb-3 shadow-lg shadow-amber-500/20">
            <i className="fa-solid fa-scissors rotate-45"></i>
          </div>
          <h2 className="text-2xl font-black text-amber-400">GROO MAX</h2>
          <p className="text-xs text-slate-400 mt-1">
            {isLogin ? 'Sign in to access your portal' : 'Create a new account'}
          </p>
        </div>

        {!isLogin && (
        <div className="bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex mb-6">
          <button
            type="button"
            onClick={() => setRole('customer')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              role === 'customer' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={() => setRole('owner')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              role === 'owner' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Salon Owner
          </button>
        </div>
        )}

        {notice && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs">{notice}</div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation text-sm"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                  <input
                    type="text"
                    required
                    placeholder="Gaurav Yadav"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Number</label>
                <div className="relative">
                  <i className="fa-solid fa-phone absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    placeholder="10-digit mobile number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Agar role owner hai, tabhi ye extra salon fields dikhengi */}
              {role === 'owner' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-amber-400 mb-1">Salon / Shop Name</label>
                    <div className="relative">
                      <i className="fa-solid fa-store absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                      <input
                        type="text"
                        required={role === 'owner'}
                        placeholder="e.g. Royal Look Unisex Salon"
                        value={formData.salonName}
                        onChange={(e) => setFormData({ ...formData, salonName: e.target.value })}
                        className="w-full bg-slate-950 border border-amber-500/40 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-400 mb-1">Salon Address / Area</label>
                    <div className="relative">
                      <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                      <input
                        type="text"
                        required={role === 'owner'}
                        placeholder="e.g. Hazratganj, Lucknow"
                        value={formData.salonAddress}
                        onChange={(e) => setFormData({ ...formData, salonAddress: e.target.value })}
                        className="w-full bg-slate-950 border border-amber-500/40 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-300">Password</label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => setForgotModal(true)}
                  className="text-[11px] text-amber-400 hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs p-1"
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>

            {!isLogin && formData.password && (
              <div className="mt-2">
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <span className="text-slate-400">Password Strength:</span>
                  <span className={`font-bold ${strength.text}`}>{strength.label}</span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                  <div className={`h-full transition-all duration-300 ${strength.color}`} style={{ width: `${strength.score}%` }}></div>
                </div>
              </div>
            )}
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Re-enter Password</label>
              <div className="relative">
                <i className="fa-solid fa-shield-halved absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs p-1"
                >
                  <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl transition text-xs shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? (
              <i className="fa-solid fa-spinner animate-spin text-sm"></i>
            ) : (
              <>
                {isLogin ? 'Login' : `Register as ${role === 'owner' ? 'SALON OWNER' : 'CUSTOMER'}`}
                <i className="fa-solid fa-arrow-right"></i>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-slate-800/80 pt-4">
          <p className="text-xs text-slate-400">
            {isLogin ? "Don't have an account?" : "Already registered?"}{' '}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-amber-400 font-bold hover:underline"
            >
              {isLogin ? 'Register Here' : 'Login Here'}
            </button>
          </p>
        </div>
      </div>

      {forgotModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 relative">
            <button 
              onClick={() => setForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>

            {forgotSuccess ? (
              <div className="text-center py-4">
                <i className="fa-solid fa-circle-check text-emerald-400 text-3xl mb-2"></i>
                <h3 className="text-sm font-bold text-slate-100">Reset Link Sent!</h3>
                <p className="text-xs text-slate-400 mt-1">Check your email inbox to reset password.</p>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <h3 className="text-base font-bold text-amber-400 mb-1">Reset Password</h3>
                <p className="text-xs text-slate-400 mb-4">Enter your registered email to receive reset instructions.</p>

                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500 mb-4"
                />

                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs"
                >
                  Send Reset Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}