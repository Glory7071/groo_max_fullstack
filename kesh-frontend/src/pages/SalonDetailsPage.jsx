import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { initialSalons } from '../services/mockData';
import { apiReviews } from '../services/apiService';

// Strict positive integer parser. 2 ya "2" -> 2. "", "abc", "2abc", 0, -1, null -> null
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

// URL param "2" ya "salon-2" dono chalega, baaki sab invalid
const parseSalonRouteId = (value) => {
  if (typeof value !== 'string') return null;
  return parseId(value.replace(/^salon-/, ''));
};

// Mock profile (photo, address, rating) sirf dikhane ke liye. Booking ke liye iska id kabhi use nahi hota.
const findMockSalon = (routeId) =>
  initialSalons.find(s => s.id === routeId || s.id === `salon-${routeId}`) || initialSalons[0];

export default function SalonDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // 1. Purane mock data se salon basic info (name, image, address, rating) nikal lenge taaki profile sahi dikhe
  const mockSalon = findMockSalon(id);
  // Booking ke liye salon id hamesha URL se, mock salon ke id se nahi
  const salonNumericId = parseSalonRouteId(id);

  const [salon, setSalon] = useState(mockSalon);
  const [dbServices, setDbServices] = useState(mockSalon.services); // Default mock services
  const [selectedService, setSelectedService] = useState(null);
  const [salonReviews, setSalonReviews] = useState([]);

  // 2. Database se sirf live services fetch karenge aur mock profile ke sath mix kar denge
  useEffect(() => {
    let cancelled = false;

    // Salon badalne par purana salon, services aur selection saaf karo
    const mock = findMockSalon(id);
    setSalon(mock);
    setDbServices(mock.services);
    setSelectedService(null);

    if (salonNumericId === null) return undefined;

    const fetchLiveServicesAndSlots = async () => {
      try {
        // Agar id 'salon-1' hai toh numeric id (jaise 1) nikal lenge
        // salonNumericId upar URL se strict parse ho chuka hai
        
        const response = await fetch(`http://localhost:5000/api/salons/${salonNumericId}`);
        const result = await response.json();
        if (cancelled) return;
        
        if (result.success && result.data) {
          // API response flat hai (salon ke fields seedhe result.data me). Nested shape bhi chalega.
          const s = result.data.salon || result.data;
          if (s) {
            // Naam aur home service live salon se. Photo aur address abhi mock se aate hain.
            setSalon(prev => ({
              ...prev,
              name: s.salon_name || prev.name,
              homeServiceAvailable: Boolean(s.is_home_service),
              homeServiceCharge: Number(s.home_service_charge || 0)
            }));
          }
          // Agar database me services milti hain, toh unhe live update kar do
          if (result.data.services && result.data.services.length > 0) {
            setDbServices(result.data.services);
          }
        }
      } catch (err) {
        if (!cancelled) console.error("Error fetching live services from database:", err);
      }
    };

    fetchLiveServicesAndSlots();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fetch Live Reviews
  useEffect(() => {
    const fetchReviews = async () => {
      const numericId = id ? id.toString().replace('salon-', '') : id;
      const reviews = await apiReviews.getSalonReviews(numericId);
      setSalonReviews(reviews);
    };
    fetchReviews();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar />

        <div className="max-w-6xl mx-auto p-4 md:p-8">
          
          {/* Back Navigation */}
          <button 
            onClick={() => navigate('/customer')}
            className="text-xs text-slate-400 hover:text-amber-400 mb-6 flex items-center gap-2 cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left"></i> Back to Exploration
          </button>

          {/* Gallery Grid (Purani profile bilkul safe rahegi) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 rounded-3xl overflow-hidden border border-slate-800">
            <img src={salon.image} alt={salon.name} className="md:col-span-2 w-full h-80 object-cover" />
            <div className="hidden md:flex flex-col gap-4">
              {salon.gallery.slice(1, 3).map((img, idx) => (
                <img key={idx} src={img} alt="salon gallery" className="w-full h-38 object-cover rounded-xl" />
              ))}
            </div>
          </div>

          {/* Salon Header Information */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8 flex flex-col md:flex-row justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-black text-slate-100">{salon.name}</h1>
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                  {salon.category}
                </span>
              </div>
              
              <p className="text-xs text-slate-400 mb-4">
                <i className="fa-solid fa-location-dot text-amber-400 mr-1.5"></i> {salon.address}
              </p>

              <div className="flex items-center gap-6 text-xs text-slate-300">
                <span><i className="fa-solid fa-star text-amber-400 mr-1"></i> <strong>{salon.rating}</strong> ({salonReviews.length} customer reviews)</span>
                <span><i className="fa-solid fa-clock text-amber-400 mr-1"></i> {salon.openingHours}</span>
              </div>
            </div>

            {salon.homeServiceAvailable && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl h-fit">
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <i className="fa-solid fa-house-user"></i> Home Service Available
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Extra Fee: ₹{salon.homeServiceCharge}</p>
              </div>
            )}
          </div>

          {/* Services List (Ab yeh database se live aane wali updated services dikhayega!) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8">
            <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-list-check text-amber-400"></i> Available Services ({dbServices.length})
            </h2>

            <div className="space-y-3">
              {dbServices.map((service) => (
                <div 
                  key={service.id}
                  onClick={() => setSelectedService(service)}
                  className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                    selectedService?.id === service.id 
                      ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-sm">{service.name}</h4>
                    <p className="text-xs text-slate-500">{service.duration} • Category: {service.category || 'General'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-amber-400">₹{service.price}</p>
                    <span className="text-[10px] text-slate-400">Click to Select</span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => {
                if (!selectedService) {
                  alert('Pehle ek service select karein!');
                  return;
                }
                if (salonNumericId === null) {
                  alert('Salon ka link galat hai. Salon list se dobara salon kholein.');
                  return;
                }
                navigate(`/customer/book/${salonNumericId}?serviceId=${selectedService.id}`);
              }}
              className="w-full mt-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl text-xs transition shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer"
            >
              Proceed To Step-By-Step Booking Flow <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>

          {/* Public Reviews Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8">
            <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-comments text-amber-400"></i> Customer Reviews & Feedback ({salonReviews.length})
            </h2>

            {salonReviews.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Be the first to review this salon!</p>
            ) : (
              <div className="space-y-3">
                {salonReviews.map((rev) => (
                  <div key={rev.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-xs text-slate-200">{rev.user}</span>
                      <div className="flex items-center gap-1 text-xs text-amber-400 font-bold">
                        {[...Array(5)].map((_, i) => (
                          <i key={i} className={`fa-solid fa-star ${i < rev.rating ? 'text-amber-400' : 'text-slate-800'}`}></i>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">"{rev.comment}"</p>
                    <p className="text-[10px] text-slate-500 mt-2">{rev.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}