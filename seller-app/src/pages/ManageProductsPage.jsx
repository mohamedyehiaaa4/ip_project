import { useEffect, useState } from "react";
import { api } from "../api";

const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
const DEFAULT_CATEGORIES = [
  "General",
  "Electronics",
  "Fashion",
  "Home",
  "Beauty",
  "Groceries",
  "Sports",
  "Books"
];

function toImageUrl(value) {
  const src = String(value || "").trim();
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return src;
  if (src.startsWith("/")) return `${API_ROOT}${src}`;
  return src;
}

export default function ManageProductsPage({ isActive = false }) {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [message, setMessage] = useState("");

  async function load() {
    const list = await api.myProducts();
    setProducts(list);
  }

  useEffect(() => {
    if (!isActive) return undefined;

    load().catch(console.error);

    const refreshTimer = setInterval(() => {
      load().catch(console.error);
    }, 3000);

    return () => clearInterval(refreshTimer);
  }, [isActive]);

  const categories = [...new Set(products.map((p) => p.category || "Uncategorized"))].sort();
  const visible = products.filter((p) => categoryFilter === "all" || (p.category || "Uncategorized") === categoryFilter);
  const groupedVisible = visible.reduce((groups, product) => {
    const category = product.category || "Uncategorized";
    if (!groups[category]) groups[category] = [];
    groups[category].push(product);
    return groups;
  }, {});

  async function saveEdit() {
    if (!editing) return;

    const payload = new FormData();
    payload.append("name", editing.name || "");
    payload.append("description", editing.description || "");
    payload.append("price", String(Number(editing.price || 0)));
    payload.append("category", editing.category || "General");
    payload.append("deliveryDays", String(Math.max(1, Number(editing.deliveryDays || 1))));
    payload.append("inventory", String(Math.max(0, Number(editing.inventory || 0))));
    payload.append("discountPercentage", String(Math.max(0, Math.min(100, Number(editing.discountPercentage || 0)))));
    if (editing.imageFile) {
      payload.append("image", editing.imageFile);
    } else {
      payload.append("imageUrl", editing.imageUrl || "");
    }

    await api.updateProduct(editing._id, payload);
    setEditing(null);
    await load();
  }

  async function removeProduct(id) {
    try {
      await api.deleteProduct(id);
      setMessage("Product deleted");
      await load();
    } catch (err) {
      setMessage(err.message || "Failed to delete product");
    }
  }

  return (
    <>
      <div className="filter-tabs">
        {message ? <div className="alert success" style={{ width: "100%", marginBottom: 12 }}>{message}</div> : null}
        <button className={`filter-btn ${categoryFilter === "all" ? "active" : ""}`} onClick={() => setCategoryFilter("all")}>All Products</button>
        <div id="categoryFilters">
          {categories.filter((category) => category !== "Uncategorized").map((category) => (
            <button
              key={category}
              className={`filter-btn ${categoryFilter === category ? "active" : ""}`}
              onClick={() => setCategoryFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div id="productsContainer">
        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No products yet</h3>
            <p>Click "Add New Product" to create your first listing</p>
          </div>
        ) : null}
      </div>

      {visible.length > 0 ? Object.entries(groupedVisible).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
        <div className="category-section" key={category}>
          <div className="category-header">
            <h2>{category}</h2>
            <span className="product-count">{items.length} product{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="products-grid">
            {items.map((p) => (
              <div className="product-card" key={p._id}>
                <div className="product-image">
                  {p.imageUrl ? <img src={toImageUrl(p.imageUrl)} alt={p.name} /> : "📦"}
                </div>
                <div className="product-info">
                  <div className="product-name">{p.name}</div>
                  <div className="product-meta">
                    <span className="meta-badge">⭐ {Number(p.ratings ?? p.rating ?? 0).toFixed(1)}</span>
                    <span className="meta-badge">📦 {Number(p.orders || 0)} orders</span>
                  </div>
                  <div className="product-price">${Number(p.price).toFixed(2)}</div>
                  <div className="product-stock">
                    <div className="stock-indicator">
                      <div className="stock-fill" style={{ width: `${Math.min(100, (Number(p.inventory || 0) / Math.max(1, Number(p.inventory || 0) + 10)) * 100)}%` }} />
                    </div>
                    <span>{Number(p.inventory || 0)} left</span>
                  </div>
                  <div className="product-actions">
                    <button
                      className="btn-edit"
                      onClick={() => setEditing({
                        ...p,
                        deliveryDays: Number(p.deliveryDays || String(p.deliveryTime || "").match(/\d+/)?.[0] || 1)
                      })}
                    >
                      Edit
                    </button>
                    <button className="btn-delete" onClick={() => removeProduct(p._id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )) : null}

      {editing ? (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Product</h2>
              <button className="modal-close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="form-group">
              <label>Product Name *</label>
              <input value={editing.name} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={editing.description || ""} onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))} placeholder="Product description..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Price ($) *</label>
                <input type="number" min="0" step="0.01" value={editing.price} onChange={(e) => setEditing((p) => ({ ...p, price: Number(e.target.value) }))} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={editing.category || "General"} onChange={(e) => setEditing((p) => ({ ...p, category: e.target.value }))}>
                  {[...new Set([...DEFAULT_CATEGORIES, ...categories])].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Stock Quantity *</label>
                <input type="number" min="0" value={editing.inventory || 0} onChange={(e) => setEditing((p) => ({ ...p, inventory: Number(e.target.value) }))} />
              </div>
              <div className="form-group">
                <label>Delivery Days *</label>
                <input type="number" min="1" step="1" value={editing.deliveryDays || 1} onChange={(e) => setEditing((p) => ({ ...p, deliveryDays: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Discount (%)</label>
                <input type="number" min="0" max="100" value={editing.discountPercentage || 0} onChange={(e) => setEditing((p) => ({ ...p, discountPercentage: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Product Image</label>
              <input type="file" accept="image/*" onChange={(e) => setEditing((p) => ({ ...p, imageFile: e.target.files?.[0] || null }))} />
              <input value={editing.imageUrl || ""} onChange={(e) => setEditing((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="Image URL" style={{ marginTop: 8 }} />
              {editing.imageFile ? <p>Selected image: {editing.imageFile.name}</p> : null}
            </div>
            <div className="form-actions">
              <button type="button" className="btn-delete" onClick={() => removeProduct(editing._id)}>Delete Product</button>
              <button type="button" className="btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="btn-save" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
