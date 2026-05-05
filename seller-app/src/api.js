const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "seller.token";
const USER_KEY = "seller.user";

function getStorage() {
  return sessionStorage;
}

export function saveAuth(token, user) {
  const storage = getStorage();
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  try {
    const raw = getStorage().getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  return getStorage().getItem(TOKEN_KEY) || "";
}

export function hasSellerSession() {
  const user = getUser();
  const token = getToken();
  return Boolean(user && user.role === "seller" && token);
}

export function logout() {
  const storage = getStorage();
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("marketplace.auth.user");
}

async function request(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  categories: () => request("/products/categories"),
  myProducts: () => request("/products/seller/me/list"),
  addProduct: (payload) => request("/products", {
    method: "POST",
    body: payload instanceof FormData ? payload : JSON.stringify(payload)
  }),
  updateProduct: (id, payload) => request(`/products/${id}`, {
    method: "PUT",
    body: payload instanceof FormData ? payload : JSON.stringify(payload)
  }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
  myOrders: () => request("/orders/seller/me"),
  sellerRating: () => request("/orders/seller/rating"),
  updateOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  rateBuyer: (payload) => request("/orders/seller/ratings/buyer", { method: "POST", body: JSON.stringify(payload) }),
  flagUser: (payload) => request("/flags", { method: "POST", body: JSON.stringify(payload) }),
  reports: () => request("/flags/seller/reports"),
  updateReportStatus: (id, status, resolutionNote = "") =>
    request(`/flags/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, resolutionNote }) }),
  deleteFlag: (id) => request(`/flags/${id}`, { method: "DELETE" }),
  myProfile: () => request("/users/seller/me/profile"),
  updateProfile: (payload) => request("/users/seller/me/profile", { method: "PATCH", body: JSON.stringify(payload) })
};
