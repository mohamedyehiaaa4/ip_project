import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function TrackingPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    api.buyerOrders()
      .then((orders) => setOrder(orders.find((o) => o._id === id) || null))
      .catch(console.error);
  }, [id]);

  if (!order) return <p>Order not found</p>;

  return (
    <section className="card">
      <h2>Order Tracking</h2>
      <p>Order ID: {order._id}</p>
      <p>Current status: {order.status}</p>
      <ol>
        <li className={order.status ? "done" : ""}>Pending</li>
        <li className={["Shipped", "Delivered"].includes(order.status) ? "done" : ""}>Shipped</li>
        <li className={order.status === "Delivered" ? "done" : ""}>Delivered</li>
      </ol>
    </section>
  );
}
