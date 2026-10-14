import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiAuth } from '../services/apiService';

// Route guard. Sirf UX ke liye hai — asli suraksha backend (verifyToken + adminMiddleware) karta hai.
// Yeh localStorage ke role par bharosa nahi karta: server se /auth/me poochta hai.
export default function RequireRole({ roles, children }) {
  const [state, setState] = useState('checking'); // checking | ok | login | denied

  useEffect(() => {
    let alive = true;
    if (!localStorage.getItem('token')) { setState('login'); return; }
    apiAuth.me()
      .then((r) => { if (alive) setState(roles.includes(r.user.role) ? 'ok' : 'denied'); })
      .catch(() => { if (alive) setState('login'); });
    return () => { alive = false; };
  }, []);

  if (state === 'checking') return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Checking access...</div>;
  if (state === 'login') return <Navigate to="/login" replace />;
  if (state === 'denied') return <Navigate to="/" replace />;
  return children;
}
