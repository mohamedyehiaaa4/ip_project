import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export default function DashboardPage({ isActive = true }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(0);
  const [ratingSummary, setRatingSummary] = useState({ rating: 0, reviewCount: 0 });

  const loadSellerRating = useCallback(() => {
    api.sellerRating()
      .then((ratingData) => {
        setRatingSummary({
          rating: Number(ratingData?.rating || 0),
          reviewCount: Number(ratingData?.reviewCount || 0)
        });
      })
      .catch((err) => {
        console.warn("Failed to load seller rating", err);
      });
  }, []);

  const loadDashboard = useCallback(() => {
    Promise.all([api.myProducts(), api.myOrders(), api.myProfile()])
      .then(([p, o, profile]) => {
        setProducts(p);
        setOrders(o);
        setBalance(Number(profile.balance || 0));
        loadSellerRating();
      })
      .catch(console.error);
  }, [loadSellerRating]);

  useEffect(() => {
    if (!isActive) return undefined;

    loadDashboard();
    const refreshTimer = setInterval(loadDashboard, 5000);

    return () => clearInterval(refreshTimer);
  }, [isActive, loadDashboard]);

  useEffect(() => {
    if (isActive) loadDashboard();
  }, [isActive, loadDashboard]);

  // Revenue only counts orders that have been paid (Credit Card on place, COD on delivery)
  const revenue = orders.reduce((sum, o) => sum + (o.paymentStatus === "Paid" ? Number(o.totalPrice || 0) : 0), 0);
  const reviewCount = Number(ratingSummary.reviewCount || 0);
  const sellerRating = reviewCount ? Number(ratingSummary.rating || 0) : null;
  const recentOrders = orders.slice(0, 5);

  return (
    <>
      <div className="header">
        <div className="header-title">
          <h1>Dashboard</h1>
          <p>Your store overview and recent activity</p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Revenue</div>
          <div className="metric-value">${revenue.toFixed(2)}</div>
          <div className="metric-subtitle">Paid orders only</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Account Balance</div>
          <div className="metric-value">${balance.toFixed(2)}</div>
          <div className="metric-subtitle">Available earnings</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Seller Rating</div>
          <div className="metric-value">{sellerRating ? `${sellerRating.toFixed(1)} ★` : "Not rated"}</div>
          <div className="metric-subtitle">{reviewCount} customer review{reviewCount === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2 style={{ marginBottom: 20 }}>Recent Orders</h2>
        <div id="recentOrdersContainer">
          {recentOrders.length ? recentOrders.map((order) => (
            <div className="order-card" key={order._id}>
              <div className="order-info">
                <h3>Order #{String(order._id).slice(-6)}</h3>
                <div className="order-meta">
                  Customer: {order.buyerName || "Unknown"}
                </div>
                <div className="order-meta" style={{ fontSize: 12, color: order.paymentStatus === "Paid" ? "green" : "#f59e0b" }}>
                  Payment: {order.paymentStatus || "Pending"} ({order.paymentMethod || "Cash on Delivery"})
                </div>
              </div>
              <span className={`status-badge status-${String(order.status || "pending").toLowerCase()}`}>
                {order.status || "Pending"}
              </span>
              <div style={{ fontWeight: 600, color: "var(--accent-strong)" }}>${Number(order.totalPrice || 0).toFixed(2)}</div>
            </div>
          )) : <div className="empty-message"><div className="empty-message-icon">📭</div><p>No orders yet</p></div>}
        </div>
      </div>
    </>
  );
}