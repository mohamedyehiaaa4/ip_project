import { useState } from "react";
import { api } from "../api";

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

export default function AddProductPage() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: 0,
    category: "General",
    deliveryDays: 3,
    inventory: 0,
    discountPercentage: 0,
    imageFile: null,
    imageUrl: ""
  });

  async function submit(e) {
    e.preventDefault();
    const payload = new FormData();
    payload.append("name", form.name);
    payload.append("description", form.description || "");
    payload.append("price", String(Number(form.price)));
    payload.append("category", form.category || "General");
    payload.append("deliveryDays", String(Math.max(1, Number(form.deliveryDays || 1))));
    payload.append("inventory", String(Math.max(0, Number(form.inventory || 0))));
    payload.append(
      "discountPercentage",
      String(Math.max(0, Math.min(100, Number(form.discountPercentage || 0))))
    );
    if (form.imageFile) {
      payload.append("image", form.imageFile);
    } else if (form.imageUrl) {
      payload.append("imageUrl", form.imageUrl);
    }

    await api.addProduct(payload);
    alert("Product added");
    setForm({
      name: "",
      description: "",
      price: 0,
      category: "General",
      deliveryDays: 3,
      inventory: 0,
      discountPercentage: 0,
      imageFile: null,
      imageUrl: ""
    });
  }

  return (
    <>
      <div className="modal-section-title">
        <h2>Add Product</h2>
        <p>Fill out the details below to publish a new listing</p>
      </div>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Product Name *</label>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Price ($) *</label>
            <input placeholder="Price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
              {DEFAULT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Inventory</label>
            <input placeholder="Inventory" type="number" min="0" value={form.inventory} onChange={(e) => setForm((p) => ({ ...p, inventory: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Discount (%)</label>
            <input placeholder="Discount (%)" type="number" min="0" max="100" value={form.discountPercentage} onChange={(e) => setForm((p) => ({ ...p, discountPercentage: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Delivery Days</label>
          <input placeholder="Delivery days" type="number" min="1" step="1" value={form.deliveryDays} onChange={(e) => setForm((p) => ({ ...p, deliveryDays: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Product Image</label>
          <div className="file-upload-wrapper">
            <input 
              id="product-image-input"
              type="file" 
              accept="image/*" 
              onChange={(e) => setForm((p) => ({ ...p, imageFile: e.target.files?.[0] || null }))} 
            />
            <label htmlFor="product-image-input" className="file-upload-label">Choose File</label>
          </div>
          <input placeholder="Image URL" value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} style={{ marginTop: 8 }} />
          {form.imageFile ? <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Selected: {form.imageFile.name}</p> : null}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-save">Save Product</button>
        </div>
      </form>
    </>
  );
}
