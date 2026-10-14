# GROO MAX - Lucknow's Premier Multi-Vendor Salon Ecosystem

GROO MAX is a comprehensive, multi-vendor web application designed for salon discovery, real-time slot booking, doorstep home services, and administrative control tailored for Lucknow (covering Gomti Nagar, Hazratganj, Alambagh, Aminabad, and Indira Nagar).

---

## 🚀 Tech Stack & Architecture

- **Frontend Framework:** React.js (with Vite)
- **Styling:** Tailwind CSS
- **Routing:** React Router DOM
- **Icons:** FontAwesome
- **Data Persistence:** LocalStorage & Modular API Service Layer (`src/services/`)

---

## 👥 Role-Based Portals & Core Features

### 1. Customer Portal (`/customer`)
- **Salon Discovery & Filtering:** Filter multi-vendor salons by Lucknow areas, categories (Men, Unisex, Spa & Wellness), and sorting options (Top Rated, Price Low to High).
- **Salon Details (`/customer/salon/:id`):** View photo gallery, operating hours, ratings, customer reviews, and home-service availability.
- **Step-by-Step Booking Wizard:** Select services, choose between salon visits or home-service (with convenience fee calculation), pick active time slots, and simulate secure payments.
- **Customer Bookings & Feedback:** Track appointment statuses (Pending, Confirmed, Completed, Cancelled/Rejected) and submit reviews.

### 2. Salon Owner Partner Portal (`/owner`)
- **Dashboard Overview:** Real-time metrics for today's bookings, pending approvals, active services, and net earnings.
- **Salon Profile Management (`/owner/salon`):** Update business name, Lucknow zone, full address, and opening/closing hours.
- **Services & Pricing Menu (`/owner/services`):** Add, edit, enable/disable, or delete salon services dynamically.
- **Availability & Slot Control:** Manage daily time slots and working schedules.
- **Bookings Management:** Accept or reject customer requests and mark services as completed.
- **Earnings & Payouts:** Track gross revenue, 10% platform commission deductions, and net settlements.
- **Home-Service Settings:** Toggle doorstep visits and configure travel charges.

### 3. Super Admin Control Panel (`/admin`)
- **Platform Overview (`/admin`):** System-wide analytics for registered customers, salons, and total commission revenue.
- **Salon Verification & Approvals (`/admin/salons`):** Review pending salon registrations and approve or suspend vendor accounts.
- **User Management (`/admin/users`):** Monitor customers and salon partners with account status toggles.
- **Bookings & Reviews Moderation:** Oversee platform-wide appointment records and moderate customer feedback.

---

## 🛠️ Getting Started Locally

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/groo-max.git](https://github.com/your-username/groo-max.git)
   cd groo-max