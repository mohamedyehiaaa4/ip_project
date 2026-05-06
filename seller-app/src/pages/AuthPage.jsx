import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "../api";

export default function AuthPage({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = isRegister
        ? { ...form, role: "seller" }
        : { email: form.email, password: form.password };

      const data = isRegister ? await api.register(payload) : await api.login(payload);
      if (data.user?.role !== "seller") {
        setError("This account is not a seller account.");
        return;
      }

      saveAuth(data.token, data.user);
      if (typeof onAuthSuccess === "function") {
        onAuthSuccess();
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="seller-auth-cover" aria-label="Seller operations preview">
        <div className="seller-auth-cover__visual">
          <div className="seller-auth-cover__shelf seller-auth-cover__shelf--top" />
          <div className="seller-auth-cover__shelf seller-auth-cover__shelf--middle" />
          <div className="seller-auth-cover__package seller-auth-cover__package--one">📦</div>
          <div className="seller-auth-cover__package seller-auth-cover__package--two">🏷️</div>
          <div className="seller-auth-cover__chart">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="seller-auth-cover__content">
          <span>Seller workspace</span>
          <h1>Manage products, orders, and delivery details faster.</h1>
          <p>Sign in to update inventory, process paid orders, and keep buyers informed.</p>
        </div>
      </aside>

      <form className="auth-card-dark" onSubmit={submit}>
        <div className="auth-brand">
          <div className="logo-badge">📦</div>
          <div>
            <h2>{isRegister ? "Create Seller Account" : "Seller Login"}</h2>
            <p>Marketplace seller portal</p>
          </div>
        </div>

        {isRegister ? (
          <>
            <div className="form-group">
              <label>Owner Name</label>
              <input
                placeholder="Owner Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Business Name</label>
              <input
                placeholder="Business Name"
                value={form.businessName}
                onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                required
              />
            </div>
          </>
        ) : null}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        <button type="submit" className="btn-save">{isRegister ? "Create account" : "Login"}</button>
        <button type="button" className="btn-cancel" onClick={() => setIsRegister((v) => !v)}>
          {isRegister ? "Have an account? Login" : "No account? Register"}
        </button>
      </form>
    </main>
  );
}
