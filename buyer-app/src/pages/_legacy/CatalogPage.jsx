import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function CatalogPage() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.products().then(setProducts).catch(console.error);
  }, []);

  return (
    <section>
      <h2>Home / Catalog</h2>
      <div className="grid">
        {products.map((p) => (
          <article key={p._id} className="card">
            <h3>{p.name}</h3>
            <p>{p.category}</p>
            <p>${p.price.toFixed(2)}</p>
            <Link to={`/products/${p._id}`}>View details</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
