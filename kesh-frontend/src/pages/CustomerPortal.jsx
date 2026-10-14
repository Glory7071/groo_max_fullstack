import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { lucknowAreas } from '../services/mockData';

export default function CustomerPortal() {
  const navigate = useNavigate();
  
  const [salons, setSalons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedArea, setSelectedArea] = useState('All Areas');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('rating');
  
  // Quick Modal State (Jo aapka wapas add kar diya gaya hai)
  const [activeSalon, setActiveSalon] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [serviceType, setServiceType] = useState('salon'); // salon | home
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const categories = ['All', 'Men', 'Unisex', 'Spa & Wellness', 'Hair & Makeup'];

  // Database se Approved Salons fetch karne ke liye useEffect
  useEffect(() => {
    const fetchApprovedSalons = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/salons');
        const data = await response.json();
        
        if (data.success && data.salons) {
          setSalons(data.salons);
        }
      } catch (err) {
        console.error("Error fetching approved salons from DB:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovedSalons();
  }, []);

  // Filtering + Sorting Logic
  const filteredSalons = salons
    .filter((salon) => {
      const salonArea = salon.area || '';
      const salonCategory = salon.category || 'Unisex';
      const salonName = salon.name || salon.salon_name || '';

      const matchesArea = selectedArea === 'All Areas' || salonArea === selectedArea;
      const matchesCategory = selectedCategory === 'All' || salonCategory.toLowerCase().includes(selectedCategory.toLowerCase());
      const matchesQuery = salonName.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesArea && matchesCategory && matchesQuery;
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 4.8) - (a.rating || 4.8);
      return 0;
    });

  // Section 9 Payment Gateway Redirect Handler (With Modal)
  const handleBooking = (e) => {
    e.preventDefault();
    if (!selectedService || !selectedSlot) {
      alert('Kripya service aur time slot select karein!');
      return;
    }

    const bookingId = 'BK-' + Math.floor(100000 + Math.random() * 900000);
    const salonName = activeSalon.name || activeSalon.salon_name;

    setActiveSalon(null);
    setSelectedService(null);
    setSelectedSlot('');
    
    navigate(`/customer/payment/${bookingId}?salon=${encodeURIComponent(salonName)}&service=${encodeURIComponent(selectedService.name)}&price=${selectedService.price}&visitType=${serviceType}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* Banner Section */}
        <div className="mb-6 text-center sm:text-left">
          <h1 className="text-3xl font-black text-amber-400 mb-2">Discover Verified Salons in Lucknow</h1>
          <p className="text-xs text-slate-400">Book instant slots in Hazratganj, Gomti Nagar, Alambagh & Aminabad.</p>
        </div>

        {/* Search, Area Location & Sorting Header */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          
          <div className="relative w-full md:w-1/2">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
            <input 
              type="text" 
              placeholder="Search approved salon..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <i className="fa-solid fa-location-dot text-amber-400"></i>
              <select 
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="bg-transparent text-slate-100 focus:outline-none cursor-pointer"
              >
                {lucknowAreas.map((area) => (
                  <option key={area} value={area} className="bg-slate-950">{area}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <i className="fa-solid fa-arrow-down-short-wide text-amber-400"></i>
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="rating" className="bg-slate-950">Top Rated</option>
              </select>
            </div>
          </div>

        </div>

        {/* Category Shortcuts Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
                selectedCategory === cat 
                  ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Salons Grid or Empty State */}
        {loading ? (
          <p className="text-center text-xs text-amber-400 py-12">Loading approved database salons...</p>
        ) : filteredSalons.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 my-8">
            <i className="fa-solid fa-store-slash text-4xl text-amber-500/40 mb-3"></i>
            <h3 className="text-base font-bold text-slate-200">No Approved Salons Found</h3>
            <p className="text-xs text-slate-500 mt-1">Jab tak admin salon ko 'approved' nahi karega, wo yahan show nahi hoga.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSalons.map((salon) => {
              const salonName = salon.name || salon.salon_name;
              const salonImage = salon.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80';
              
              return (
                <div key={salon.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition flex flex-col">
                  
                  <div 
                    className="relative h-48 overflow-hidden cursor-pointer group" 
                    onClick={() => navigate(`/customer/salon/${salon.id}`)}
                  >
                    <img src={salonImage} alt={salonName} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    <span className="absolute top-3 right-3 bg-slate-950/80 text-amber-400 text-xs px-3 py-1 rounded-full border border-amber-500/30 font-semibold">
                      {salon.category || 'Unisex'}
                    </span>
                    <span className="absolute bottom-3 left-3 bg-slate-950/80 text-slate-200 text-xs px-3 py-1 rounded-full flex items-center gap-1 border border-slate-800">
                      <i className="fa-solid fa-location-dot text-amber-400"></i> {salon.area}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 
                          onClick={() => navigate(`/customer/salon/${salon.id}`)}
                          className="font-bold text-lg text-slate-100 hover:text-amber-400 transition cursor-pointer"
                        >
                          {salonName}
                        </h3>
                        
                        <div className="flex items-center gap-1 text-xs text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                          <i className="fa-solid fa-star"></i> {salon.rating || '4.8'}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">{salon.address}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => navigate(`/customer/salon/${salon.id}`)}
                        className="bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 font-semibold py-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <i className="fa-solid fa-eye text-amber-400"></i> Details
                      </button>

                      <button 
                        onClick={() => setActiveSalon(salon)}
                        className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        Book Slot <i className="fa-solid fa-arrow-right"></i>
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Booking Modal (Aapka original modal wapas add kar diya gaya hai) */}
      {activeSalon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setActiveSalon(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 cursor-pointer">
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>

            {bookingSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                  <i className="fa-solid fa-check"></i>
                </div>
                <h3 className="text-2xl font-bold text-slate-100 mb-2">Booking Confirmed!</h3>
                <p className="text-xs text-slate-400">Aapki appointment successful lag gayi hai.</p>
              </div>
            ) : (
              <form onSubmit={handleBooking}>
                <h2 className="text-xl font-bold text-amber-400 mb-1">{activeSalon.name || activeSalon.salon_name}</h2>
                <p className="text-xs text-slate-400 mb-4">{activeSalon.address}</p>

                {activeSalon.homeServiceAvailable && (
                  <div className="mb-4 bg-slate-950 p-2 rounded-xl border border-slate-800 flex text-xs">
                    <button
                      type="button"
                      onClick={() => setServiceType('salon')}
                      className={`flex-1 py-1.5 rounded-lg font-bold transition ${
                        serviceType === 'salon' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      Salon Visit
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceType('home')}
                      className={`flex-1 py-1.5 rounded-lg font-bold transition ${
                        serviceType === 'home' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      Home Service (+₹{activeSalon.home_service_charge || 150})
                    </button>
                  </div>
                )}

                <h4 className="text-xs font-semibold text-slate-200 mb-2">1. Select Service:</h4>
                <div className="space-y-2 mb-4">
                  {activeSalon.services && activeSalon.services.length > 0 ? (
                    activeSalon.services.map((service) => (
                      <div 
                        key={service.id}
                        onClick={() => setSelectedService(service)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between text-xs ${
                          selectedService?.id === service.id 
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{service.name}</p>
                          <p className="text-[10px] text-slate-500">{service.duration}</p>
                        </div>
                        <span className="font-bold">₹{service.price}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No services listed yet.</p>
                  )}
                </div>

                <h4 className="text-xs font-semibold text-slate-200 mb-2">2. Select Time Slot:</h4>
                <div className="grid grid-cols-3 gap-2 mb-6">
                  {(activeSalon.slots || ['10:00 AM', '11:30 AM', '02:00 PM', '04:30 PM']).map((slot) => {
                    const slotTime = slot.time_slot || slot;
                    return (
                      <button
                        type="button"
                        key={slotTime}
                        onClick={() => setSelectedSlot(slotTime)}
                        className={`py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                          selectedSlot === slotTime 
                            ? 'bg-amber-500 text-slate-950 border-amber-500' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {slotTime}
                      </button>
                    );
                  })}
                </div>

                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-2">
                  <i className="fa-solid fa-lock"></i>
                  Proceed To Payment Gateway →
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}