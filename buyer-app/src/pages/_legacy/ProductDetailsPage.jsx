import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState({ product: null, comments: [] });
  const [summary, setSummary] = useState("");

  useEffect(() => {
    api.productDetails(id).then(setPayload).catch(console.error);
    api.summary(id).then((d) => setSummary(d.summary)).catch(() => setSummary("No summary yet"));
  }, [id]);

  async function buyNow() {
    try {
      await api.placeOrder([{ productId: id, quantity: 1 }], "Cash on Delivery");
      navigate("/orders");
    } catch (err) {
      alert(err.message);
    }
  }

  if (!payload.product) return <p>Loading...</p>;

  return (
    <section className="card">
      <h2>Product Details</h2>
      <h3>{payload.product.name}</h3>
      <p>{payload.product.description}</p>
      <p>Price: ${payload.product.price.toFixed(2)}</p>
      <p>Delivery: {payload.product.deliveryTime}</p>
      <button onClick={buyNow}>Place order</button>

      <h4>AI Comment Summary</h4>
      <p>{summary}</p>
    </section>
  );
}
