import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function SearchResultsPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  async function search(e) {
    e.preventDefault();
    const data = await api.products(q, "");
    setResults(data);
  }

  return (
    <section>
      <h2>Search Results</h2>
      <form onSubmit={search} className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
        <button type="submit">Search</button>
      </form>

      <div className="grid">
        {results.map((p) => (
          <article key={p._id} className="card">
            <h3>{p.name}</h3>
            <p>${p.price.toFixed(2)}</p>
            <Link to={`/products/${p._id}`}>Open</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
