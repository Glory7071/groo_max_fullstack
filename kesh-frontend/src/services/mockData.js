export const lucknowAreas = [
  'All Areas',
  'Gomti Nagar',
  'Hazratganj',
  'Alambagh',
  'Aminabad',
  'Indira Nagar'
];

export const initialSalons = [
  {
    id: 'salon-1',
    name: 'Glitz & Glamour Studio',
    category: 'Unisex',
    area: 'Gomti Nagar',
    address: 'Near Patrakar Puram, Gomti Nagar, Lucknow',
    rating: 4.8,
    reviewsCount: 142,
    image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '09:00 AM - 09:00 PM',
    homeServiceAvailable: true,
    homeServiceCharge: 150,
    services: [
      { id: 's1', name: 'Haircut & Styling', price: 350, duration: '45 mins', category: 'Hair' },
      { id: 's2', name: 'Beard Grooming & Spa', price: 200, duration: '30 mins', category: 'Beard' },
      { id: 's3', name: 'Detan Facial & Scrub', price: 699, duration: '60 mins', category: 'Facial' }
    ],
    slots: ['10:00 AM', '11:30 AM', '02:00 PM', '04:30 PM', '06:00 PM', '07:30 PM']
  },
  {
    id: 'salon-2',
    name: 'Royal Heritage Cutters',
    category: 'Men',
    area: 'Hazratganj',
    address: 'MG Marg, Near Janpath Market, Hazratganj, Lucknow',
    rating: 4.9,
    reviewsCount: 218,
    image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '10:00 AM - 08:30 PM',
    homeServiceAvailable: false,
    homeServiceCharge: 0,
    services: [
      { id: 's4', name: 'Royal Beard Trim & Spa', price: 250, duration: '30 mins', category: 'Beard' },
      { id: 's5', name: 'Gentlemens Premium Haircut', price: 400, duration: '40 mins', category: 'Hair' },
      { id: 's6', name: 'Charcoal Face Cleanup', price: 499, duration: '45 mins', category: 'Facial' }
    ],
    slots: ['10:30 AM', '12:00 PM', '03:00 PM', '05:00 PM', '07:00 PM']
  },
  {
    id: 'salon-3',
    name: 'Elegance Unisex Beauty Lounge',
    category: 'Unisex',
    area: 'Alambagh',
    address: 'Near Alambagh Metro Station, VIP Road, Lucknow',
    rating: 4.7,
    reviewsCount: 98,
    image: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '09:30 AM - 09:00 PM',
    homeServiceAvailable: true,
    homeServiceCharge: 120,
    services: [
      { id: 's7', name: 'Keratin Hair Treatment', price: 2499, duration: '120 mins', category: 'Hair Treatment' },
      { id: 's8', name: 'Global Hair Color', price: 1499, duration: '90 mins', category: 'Hair' },
      { id: 's9', name: 'Gold Facial & Glow Package', price: 999, duration: '60 mins', category: 'Facial' }
    ],
    slots: ['11:00 AM', '01:00 PM', '03:30 PM', '06:00 PM']
  },
  {
    id: 'salon-4',
    name: 'Awadh Traditional Hair Parlour',
    category: 'Men',
    area: 'Aminabad',
    address: 'Near Hanuman Temple, Main Market, Aminabad, Lucknow',
    rating: 4.6,
    reviewsCount: 175,
    image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '08:00 AM - 09:30 PM',
    homeServiceAvailable: false,
    homeServiceCharge: 0,
    services: [
      { id: 's10', name: 'Classic Lucknowi Barber Cut', price: 180, duration: '25 mins', category: 'Hair' },
      { id: 's11', name: 'Head Massage & Hot Oil', price: 150, duration: '20 mins', category: 'Massage' },
      { id: 's12', name: 'Shave & Aftershave Cool Splash', price: 100, duration: '15 mins', category: 'Shave' }
    ],
    slots: ['09:00 AM', '11:00 AM', '02:00 PM', '05:00 PM', '08:00 PM']
  },
  {
    id: 'salon-5',
    name: 'Crown Spa & Beauty Hub',
    category: 'Spa & Wellness',
    area: 'Indira Nagar',
    address: 'B-Block Market, Near Church, Indira Nagar, Lucknow',
    rating: 4.9,
    reviewsCount: 310,
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '10:00 AM - 08:00 PM',
    homeServiceAvailable: true,
    homeServiceCharge: 200,
    services: [
      { id: 's13', name: 'Aromatherapy Full Body Massage', price: 1800, duration: '60 mins', category: 'Spa' },
      { id: 's14', name: 'Deep Tissue Relief Therapy', price: 2200, duration: '75 mins', category: 'Spa' },
      { id: 's15', name: 'Organic Fruit Hair Spa', price: 799, duration: '45 mins', category: 'Hair Spa' }
    ],
    slots: ['10:30 AM', '01:30 PM', '04:00 PM', '06:30 PM']
  },
  {
    id: 'salon-6',
    name: 'Velocity Men Hair Studio',
    category: 'Men',
    area: 'Gomti Nagar',
    address: 'Near Riverside Mall, Gomti Nagar Extension, Lucknow',
    rating: 4.8,
    reviewsCount: 86,
    image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80'
    ],
    openingHours: '10:00 AM - 09:00 PM',
    homeServiceAvailable: true,
    homeServiceCharge: 150,
    services: [
      { id: 's16', name: 'Fade Cut & Beard Styling', price: 450, duration: '45 mins', category: 'Hair' },
      { id: 's17', name: 'Hair Color & Grey Blending', price: 599, duration: '40 mins', category: 'Color' },
      { id: 's18', name: 'Hydra Facial for Men', price: 1200, duration: '50 mins', category: 'Facial' }
    ],
    slots: ['11:00 AM', '01:00 PM', '03:30 PM', '06:00 PM', '08:00 PM']
  }
];