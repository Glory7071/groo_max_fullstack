-- 1. Users Table (Customers, Salon Owners, Admin)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'customer', -- 'customer', 'salon_owner', 'admin'
    is_verified BOOLEAN DEFAULT FALSE,  
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Salons Table (Salon Profiles managed by owners)
CREATE TABLE IF NOT EXISTS salons (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    salon_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) DEFAULT 'Unisex', -- 'Unisex', 'Men', 'Spa & Wellness'
    area VARCHAR(100) NOT NULL,           -- e.g. 'Gomti Nagar'
    address TEXT NOT NULL,
    openingHours VARCHAR(100) DEFAULT '09:00 AM - 09:00 PM',
    home_service_available BOOLEAN DEFAULT FALSE,
    home_service_charge NUMERIC(10,2) DEFAULT 0,
    is_open BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'pending'   -- 'pending', 'approved', 'rejected'
);

-- 3. Services Table (Services offered by each salon)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,        -- 'Hair', 'Beard', 'Facial', 'Spa'
    price NUMERIC(10,2) NOT NULL,
    duration VARCHAR(50) NOT NULL,        -- e.g. '30 mins'
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. Time Slots Table (Available slots for booking)
CREATE TABLE IF NOT EXISTS salon_slots (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    time_slot VARCHAR(50) NOT NULL,       -- e.g. '10:00 AM'
    is_active BOOLEAN DEFAULT TRUE
);

-- 5. Bookings Table (Appointments & Doorstep Services)
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    service_name VARCHAR(100) NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    booking_date DATE NOT NULL,
    service_type VARCHAR(30) NOT NULL,    -- 'salon_visit' or 'doorstep'
    address TEXT NULL,                    -- Required if doorstep service
    total_price NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rejected'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Reviews Table (Customer reviews for salons)
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    comment TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Visible', -- 'Visible', 'Hidden'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);