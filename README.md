# Marketplace

A full-stack e-commerce platform built with React, Node.js, and MongoDB. This project has separate apps for buyers and sellers, each with their own UI but sharing the same backend API.

## What's Inside

- **Backend** - Express server handling all the business logic (auth, orders, products, ratings)
- **Buyer App** - React app where customers browse, search, and buy products
- **Seller App** - React app for sellers to manage products, orders, and view ratings

## Tech Stack

**Backend:**
- Node.js + Express
- MongoDB (for data)
- JWT (for authentication)
- bcryptjs (for password hashing)
- Multer (for file uploads)

**Frontend:**
- React (via Vite)
- Vanilla CSS (custom styling, no Tailwind or Bootstrap)
- React Router (for navigation)

## Getting Started

### 1. Install Everything

From the root directory, run:
```bash
npm run install:all
```

This installs dependencies for the root, backend, buyer-app, and seller-app all at once.

### 2. Setup MongoDB

Make sure MongoDB is running. If you're using Docker:
```bash
docker run -d -p 27017:27017 --name marketplace-mongo mongo
```

### 3. Create `.env` File

Create `backend/.env` with:
```
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/market_place
JWT_SECRET=your_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d
```

### 4. Run Everything

Open 3 separate terminals and run:

**Terminal 1 - Backend:**
```bash
npm run dev:backend
```

**Terminal 2 - Buyer App:**
```bash
npm run dev:buyer
```

**Terminal 3 - Seller App:**
```bash
npm run dev:seller
```

That's it! Your local marketplace is running:
- Backend: `http://localhost:4000`
- Buyer App: `http://localhost:5173`
- Seller App: `http://localhost:5174`

## Features

### For Buyers
- Browse and search products
- View product details with images
- Place orders
- Track order status (Placed → Processing → Preparing → Shipping → Delivered)
- Rate sellers after delivery
- View order history with filters
- Cancel orders if still in early stages

### For Sellers
- Add and manage products
- Upload product images
- View all orders
- Update order status as it progresses
- See buyer ratings and feedback
- Track sales and revenue

### General
- User authentication (separate for buyers and sellers)
- Order management with detailed tracking
- Rating system (buyers rate sellers, sellers rate buyers)
- Flag/report system for problematic orders
- Responsive design that works on mobile, tablet, desktop

## Project Structure

```
Market_Place/
├── backend/              # Express server
│   ├── src/
│   │   ├── server.js
│   │   ├── middleware/   # Auth middleware
│   │   ├── models/       # MongoDB schemas
│   │   └── routes/       # API endpoints
│   └── uploads/          # Product images stored here
├── buyer-app/            # React app for customers
│   └── src/
│       ├── App.jsx
│       ├── pages/        # Different pages (products, orders, etc)
│       └── styles.css
├── seller-app/           # React app for sellers
│   └── src/
│       ├── App.jsx
│       ├── pages/        # Dashboard, manage products, etc
│       └── styles.css
└── package.json          # Root package with scripts
```
"# ip_project" 
"# ip_project" 
