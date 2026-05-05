import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../api";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [reason, setReason] = useState("");
  const user = getUser();

  useEffect(() => {
    api.buyerOrders().then(setOrders).catch(console.error);
  }, []);

  async function flagSeller(sellerId, orderId) {
    try {
      await api.flagUser({ reportedUserId: sellerId, reason: reason || "Issue with order", orderId });
      alert("Seller flagged successfully");
      setReason("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function addComment(productId) {
    const text = prompt("Write your comment");
    const rating = Number(prompt("Rating 1-5") || 5);
    if (!text) return;
    await api.addComment({ productId, text, rating });
    alert("Comment saved");
  }

  return (
    <section>
      <h2>Orders Page</h2>
      <input
        placeholder="Flag reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="grid">
        {orders.map((order) => (
          <article className="card" key={order._id}>
            <h3>Order {order._id.slice(-6)}</h3>
            <p>Status: {order.status}</p>
            <p>Total: ${order.totalPrice.toFixed(2)}</p>
            <Link to={`/orders/${order._id}/tracking`}>Track order</Link>
            {order.products.map((item) => (
              <button key={item.productId} onClick={() => addComment(item.productId)}>
                Comment Product
              </button>
            ))}
            <button onClick={() => flagSeller(order.sellerId, order._id)} disabled={!user}>
              Flag Seller
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
