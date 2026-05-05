import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "../api";

export default function AuthPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = isRegister ? { ...form, role: "buyer" } : { email: form.email, password: form.password };
      const data = isRegister ? await api.register(payload) : await api.login(payload);
      saveAuth(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <h2>{isRegister ? "Buyer Register" : "Buyer Login"}</h2>
        {isRegister ? (
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        ) : null}
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">{isRegister ? "Create account" : "Login"}</button>
        <button type="button" className="ghost" onClick={() => setIsRegister((v) => !v)}>
          {isRegister ? "Have an account? Login" : "No account? Register"}
        </button>
      </form>
    </main>
  );
}
