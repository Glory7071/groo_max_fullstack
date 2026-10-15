import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://groomax-backend.onrender.com/api';

// Axios instance with base URL and automatic token injector
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to attach JWT token from localStorage automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Server ka 'error' ya 'message' dono ko UI ke 'message' me badalta hai
export const normalizeError = (error, fallback) => {
  const d = error.response?.data;
  return { success: false, status: error.response?.status, message: d?.error || d?.message || fallback };
};

// Session kharab/expire (401): saaf karke login par bhejo. Token ke bina admin pages kabhi khule nahi rahenge.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('groomax_user');
      sessionStorage.removeItem('groomax_user');
      if (!window.location.pathname.startsWith('/auth')) window.location.assign('/auth');
    }
    return Promise.reject(error);
  }
);

// 1. AUTHENTICATION SERVICES
export const apiAuth = {
  me: async () => (await api.get('/auth/me')).data,
  updateProfile: async (full_name, mobile, address) => {
    try {
      return (await api.put('/auth/profile', { full_name, mobile, address })).data;
    } catch (error) {
      throw normalizeError(error, 'Profile save nahi ho paya.');
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('groomax_user');
    sessionStorage.removeItem('groomax_user');
  },
  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      return response.data;
    } catch (error) {
      throw normalizeError(error, 'Login failed. Please check your credentials.');
    }
  },

  register: async (name, email, password, role, phone, salonName, salonAddress) => {
    try {
      const response = await api.post('/auth/register', { 
        full_name: name, 
        email, 
        password, 
        role, 
        mobile: phone,
        salon_name: salonName,     // Backend ke liye salon name
        address: salonAddress      // Backend ke liye address
      });
      return response.data;
    } catch (error) {
      throw normalizeError(error, 'Registration failed.');
    }
  }
};

// 2. SALON DISCOVERY SERVICES
export const apiSalons = {
  getAllSalons: async () => {
    try {
      const response = await api.get('/salons');
      return response.data.salons || response.data;
    } catch (error) {
      console.error('Error fetching salons:', error);
      return [];
    }
  },

  getSalonById: async (salonId) => {
    try {
      const response = await api.get(`/salons/${salonId}`);
      const d = response.data;
      return (d.data && (d.data.salon || d.data)) || d.salon;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Salon not found.' };
    }
  }
};

// Backend ka error saaf message me badalta hai. Route server.js me mount na ho to (HTML 404) wo bhi batata hai.
const apiError = (error, fallback) => {
  const data = error.response?.data;
  if (typeof data === 'string' || (error.response?.status === 404 && !data?.message && !data?.error)) {
    return { success: false, message: 'Ye feature backend me abhi chalu nahi hai. README ke hisaab se server.js me naye route ke lines daalein aur backend restart karein.' };
  }
  return { success: false, ...data, message: data?.message || data?.error || fallback };
};

// 3. BOOKINGS SERVICES
export const apiBookings = {
  // Create a new booking via backend API
  createBooking: async (bookingData) => {
    try {
      const response = await api.post('/bookings', bookingData);
      return response.data;
    } catch (error) {
      const data = error.response?.data;
      throw { success: false, ...data, message: data?.message || data?.error || 'Failed to create booking.' };
    }
  },

  // Fetch logged-in customer's bookings
  getUserBookings: async () => {
    try {
      const response = await api.get('/bookings/my-bookings');
      return response.data.bookings || response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to fetch user bookings.' };
    }
  },

  // Salon ke slots: kaun sa is date par khali hai, kaun sa book ho chuka
  getAvailability: async (salonId, date) => {
    try {
      const response = await api.get(`/bookings/availability/${salonId}`, { params: { date } });
      // Array hi wapas aata hai; salon ki chhutti ho to usi array par holiday / reason bhi laga hota hai
      const list = response.data.slots || [];
      list.holiday = !!response.data.holiday;
      list.reason = response.data.reason || null;
      return list;
    } catch (error) {
      throw apiError(error, 'Slots load nahi ho paye.');
    }
  },

  // Cancel dabane se pehle: kitna refund milega
  getCancelPreview: async (bookingId) => {
    try {
      const response = await api.get(`/bookings/${bookingId}/cancel-preview`);
      return response.data;
    } catch (error) {
      throw apiError(error, 'Cancel ki jankari load nahi ho payi.');
    }
  },

  cancelBooking: async (bookingId) => {
    try {
      const response = await api.patch(`/bookings/${bookingId}/cancel`);
      return response.data;
    } catch (error) {
      throw apiError(error, 'Booking cancel nahi ho payi.');
    }
  },

  // Booking ka date / time badlo (naya time owner ko dobara confirm karna padta hai)
  reschedule: async (bookingId, booking_date, time_slot) => {
    try {
      const response = await api.patch(`/bookings/${bookingId}/reschedule`, { booking_date, time_slot });
      return response.data;
    } catch (error) {
      throw apiError(error, 'Time badal nahi paya.');
    }
  },

  // Khatam booking apni list se hatao (record database me rehta hai)
  hideBooking: async (bookingId) => {
    try {
      const response = await api.patch(`/bookings/${bookingId}/hide`);
      return response.data;
    } catch (error) {
      throw apiError(error, 'Booking hata nahi payi.');
    }
  },

  clearFinished: async () => {
    try {
      const response = await api.post('/bookings/clear-finished');
      return response.data;
    } catch (error) {
      throw apiError(error, 'Bookings hata nahi payi.');
    }
  },

  // Fetch specific salon bookings for owner view
  getSalonBookings: async (salonId) => {
    try {
      const response = await api.get(`/owner/salon/${salonId}`);
      return response.data.data.bookings;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to fetch salon bookings.' };
    }
  }
};

// 4. REVIEWS & FEEDBACK SERVICES
export const apiReviews = {
  getSalonReviews: async (salonId) => {
    try {
      const response = await api.get(`/reviews/${salonId}`);
      const r = response.data.reviews ?? response.data;
      return Array.isArray(r) ? r : [];
    } catch (error) {
      console.error('Error fetching reviews:', error);
      return [];
    }
  },

  // Jin bookings par review diya ja sakta hai (login zaroori)
  getEligible: async () => {
    try {
      const response = await api.get('/reviews/eligible');
      return response.data.bookings || [];
    } catch (error) {
      const data = error.response?.data;
      throw { success: false, ...data, message: (data?.message || data?.error || 'Bookings load nahi ho payi.') + (data?.detail ? ` (${data.detail})` : '') };
    }
  },

  addReview: async (reviewData) => {
    try {
      const response = await api.post('/reviews', reviewData);
      return response.data;
    } catch (error) {
      const data = error.response?.data;
      throw { success: false, ...data, message: data?.message || data?.error || 'Failed to add review.' };
    }
  }
};

// 5. PAYMENT SERVICES
export const apiPayments = {
  getConfig: async () => {
    try {
      return (await api.get('/payments/config')).data;
    } catch (error) {
      throw apiError(error, 'Payment ki jaankari nahi mil paayi.');
    }
  },
  getSummary: async (bookingId) => {
    try {
      return (await api.get(`/payments/summary/${bookingId}`)).data.booking;
    } catch (error) {
      throw apiError(error, 'Booking ka hisaab load nahi ho paya.');
    }
  },
  createOrder: async (bookingId) => {
    try {
      return (await api.post('/payments/create-order', { booking_id: bookingId })).data;
    } catch (error) {
      throw apiError(error, 'Payment shuru nahi ho paya.');
    }
  },
  verify: async (payload) => {
    try {
      return (await api.post('/payments/verify', payload)).data;
    } catch (error) {
      throw apiError(error, 'Payment verify nahi ho paya.');
    }
  },
  testPay: async (bookingId) => {
    try {
      return (await api.post('/payments/test-pay', { booking_id: bookingId })).data;
    } catch (error) {
      throw apiError(error, 'Test payment nahi ho paya.');
    }
  },
  payAtSalon: async (bookingId) => {
    try {
      return (await api.post('/payments/pay-at-salon', { booking_id: bookingId })).data;
    } catch (error) {
      throw apiError(error, 'Save nahi ho paya.');
    }
  }
};

// 6. COMPLAINTS (customer)
export const apiComplaints = {
  create: async (message, bookingId) => {
    try {
      return (await api.post('/complaints', { message, booking_id: bookingId || null })).data;
    } catch (error) {
      throw apiError(error, 'Shikayat bhej nahi paye.');
    }
  }
};

// 7. ADMIN SERVICES
const adminGet = async (path, fallback) => {
  try {
    return (await api.get(path)).data;
  } catch (error) {
    throw apiError(error, fallback);
  }
};
export const apiAdmin = {
  overview: async () => (await adminGet('/admin/overview', 'Dashboard load nahi ho paya.')).data,
  salons: async () => (await adminGet('/admin/salons', 'Salons load nahi ho paye.')).salons,
  users: async () => (await adminGet('/admin/users', 'Users load nahi ho paye.')).users,
  bookings: async () => (await adminGet('/admin/bookings', 'Bookings load nahi ho payi.')).bookings,
  reviews: async () => (await adminGet('/reviews/admin/all', 'Reviews load nahi ho paye.')).reviews,
  refunds: async () => (await adminGet('/bookings/admin/refunds', 'Refunds load nahi ho paye.')).refunds,
  complaints: async () => (await adminGet('/complaints/admin/all', 'Shikayatein load nahi ho payi.')).complaints,
  setSalonStatus: async (id, status) => {
    try {
      return (await api.patch(`/admin/salons/${id}/status`, { status })).data;
    } catch (error) {
      throw apiError(error, 'Status badal nahi paya.');
    }
  },
  deleteReview: async (id) => {
    try {
      return (await api.delete(`/reviews/${id}`)).data;
    } catch (error) {
      throw apiError(error, 'Review hata nahi paya.');
    }
  },
  refundAction: async (id, action, reference) => {
    try {
      return (await api.patch(`/bookings/admin/refunds/${id}`, { action, reference })).data;
    } catch (error) {
      throw apiError(error, 'Refund par kaam nahi ho paya.');
    }
  },
  resolveComplaint: async (id, status, admin_note) => {
    try {
      return (await api.patch(`/complaints/admin/${id}`, { status, admin_note })).data;
    } catch (error) {
      throw apiError(error, 'Shikayat update nahi ho payi.');
    }
  }
};
