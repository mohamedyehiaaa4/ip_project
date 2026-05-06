import { useEffect, useState } from "react";
import { api } from "../api";

function hasAddressDetails(address) {
  return Boolean(address && [address.line1, address.addressLine, address.city, address.country, address.postalCode].some((value) => String(value || "").trim()));
}

function formatAddress(address) {
  if (!address) return "No delivery address provided";
  return [address.line1, address.city, address.country, address.postalCode].filter(Boolean).join(", ") || "No delivery address provided";
}

const statuses = ["Placed", "Processing", "Preparing", "Shipping", "Delivered", "Cancelled"];

export default function OrdersManagementPage() {
  const [orders, setOrders] = useState([]);
  const [flagDetails, setFlagDetails] = useState({});   // per-order flag details
  const [flagged, setFlagged] = useState({});           // tracks already-flagged orders
  const [ratingDrafts, setRatingDrafts] = useState({});
  const [message, setMessage] = useState({ text: "", type: "success" });

  async function load() {
    const data = await api.myOrders();
    setOrders(data);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function showMessage(text, type = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "success" }), 3000);
  }

  async function updateStatus(orderId, status) {
    try {
      await api.updateOrderStatus(orderId, status);
      showMessage(`Order #${String(orderId).slice(-6)} updated to ${status}`);
      await load();
    } catch (err) {
      showMessage(err.message || "Failed to update status", "error");
    }
  }

  async function flagBuyer(order) {
    try {
      const details = flagDetails[order._id] || "";
      await api.flagUser({
        reportedUserId: order.buyerId,
        reason: "Package Not Received",
        details,
        orderId: order._id
      });
      setFlagged((prev) => ({ ...prev, [order._id]: true }));
      setFlagDetails((prev) => ({ ...prev, [order._id]: "" }));
      showMessage(`Buyer flagged for order #${String(order._id).slice(-6)}`);
    } catch (err) {
      showMessage(err.message || "Failed to flag buyer", "error");
    }
  }

  async function rateBuyer(order, rating, comment) {
    try {
      await api.rateBuyer({ orderId: order._id, buyerId: order.buyerId, rating, comment });
      showMessage(`Buyer rating saved for order #${String(order._id).slice(-6)}`);
      await load();
    } catch (err) {
      showMessage(err.message || "Failed to rate buyer", "error");
    }
  }

  function getRatingDraft(order) {
    const existing = ratingDrafts[order._id];
    if (existing) return existing;
    return {
      rating: order.buyer_rating ? String(order.buyer_rating) : "",
      comment: order.buyer_rating_comment || ""
    };
  }

  // Only eligible to flag if order is in Shipping or Delivered status
  function canFlagBuyer(order) {
    return ["Shipping", "Delivered"].includes(order.status);
  }

  return (
    <>
      <div className="header">
        <div className="header-title">
          <h1>Orders Management</h1>
          <p>Update order status, rate buyers, and report non-receipt issues</p>
        </div>
      </div>

      {message.text ? (
        <div className="alert" style={{
          marginBottom: 16,
          background: message.type === "error" ? "#fee2e2" : "#dcfce7",
          color: message.type === "error" ? "#b91c1c" : "#15803d",
          padding: "10px 14px",
          borderRadius: 8
        }}>
          {message.text}
        </div>
      ) : null}

      <div className="orders-list">
        {orders.length ? orders.map((order) => (
          <div className="order-card" key={order._id}>
            <div className="order-info">
              <h3>Order #{String(order._id).slice(-6)}</h3>
              <div className="order-meta">Buyer: {order.buyerName || "Unknown"}</div>
              <div className="order-meta">Product: {order.product || "Unknown"}</div>
              <div className={`order-address ${hasAddressDetails(order.deliveryAddress) ? "" : "order-address--missing"}`}>
                <span className="order-address__icon" aria-hidden="true">📍</span>
                <span className="order-address__content">
                  <strong>Delivery Address</strong>
                  <small>{formatAddress(order.deliveryAddress)}</small>
                </span>
              </div>
              <div className="order-meta" style={{ fontSize: 12, color: order.paymentStatus === "Paid" ? "#15803d" : "#d97706" }}>
                Payment: {order.paymentStatus || "Pending"} ({order.paymentMethod || "Cash on Delivery"})
              </div>
            </div>

            <div className="order-actions">
              {/* Status update */}
              <div className="form-group">
                <label>Order Status</label>
                <select
                  className="order-status-select"
                  value={order.status}
                  onChange={(e) => updateStatus(order._id, e.target.value)}
                >
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Buyer rating */}
              <div className="form-group">
                <label>Buyer Rating</label>
                <select
                  value={getRatingDraft(order).rating}
                  onChange={(e) =>
                    setRatingDrafts((prev) => ({
                      ...prev,
                      [order._id]: { ...getRatingDraft(order), rating: e.target.value }
                    }))
                  }
                >
                  <option value="">Rate buyer...</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} - {["Poor", "Fair", "Good", "Very Good", "Excellent"][n - 1]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Rating Note</label>
                <input
                  placeholder="Optional rating note"
                  value={getRatingDraft(order).comment}
                  onChange={(e) =>
                    setRatingDrafts((prev) => ({
                      ...prev,
                      [order._id]: { ...getRatingDraft(order), comment: e.target.value }
                    }))
                  }
                />
              </div>

              {/* Per-order flag section — only visible for Shipping/Delivered */}
              {canFlagBuyer(order) && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 6 }}>
                    📦 Flag buyer for package not received
                  </p>
                  {flagged[order._id] ? (
                    <p style={{ fontSize: 12, color: "#15803d" }}>✅ Buyer has been flagged for this order</p>
                  ) : (
                    <>
                      <input
                        placeholder="Details about non-receipt (optional)"
                        value={flagDetails[order._id] || ""}
                        onChange={(e) =>
                          setFlagDetails((prev) => ({ ...prev, [order._id]: e.target.value }))
                        }
                        style={{ marginBottom: 6, fontSize: 13 }}
                      />
                      <button
                        className="btn-flag"
                        onClick={() => flagBuyer(order)}
                      >
                        Flag Buyer
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="order-footer">
              <div className="order-price">${Number(order.totalPrice || 0).toFixed(2)}</div>
              <div className="form-actions">
                <button
                  className="btn-rating-save"
                  onClick={() => {
                    const draft = getRatingDraft(order);
                    const rating = Number(draft.rating || 0);
                    if (!rating || rating < 1 || rating > 5) {
                      showMessage("Please select a rating 1–5 before saving", "error");
                      return;
                    }
                    rateBuyer(order, rating, draft.comment || "");
                  }}
                >
                  Save Buyer Rating
                </button>
              </div>
            </div>
          </div>
        )) : (
          <div className="empty-message">
            <div className="empty-message-icon">📭</div>
            <p>No orders yet</p>
          </div>
        )}
      </div>
    </>
  );
}
