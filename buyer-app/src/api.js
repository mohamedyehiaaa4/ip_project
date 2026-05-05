const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "buyer.token";
const USER_KEY = "buyer.user";

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

export function logout() {
  const storage = getStorage();
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
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
  products: (q = "", category = "") => request(`/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  productDetails: (id) => request(`/products/${id}`),
  placeOrder: (items, paymentMethod = "Cash on Delivery", cardDetails = null) =>
    request("/orders", { method: "POST", body: JSON.stringify({ items, paymentMethod, cardDetails }) }),
  buyerOrders: () => request("/orders/buyer/me"),
  cancelOrder: (orderId) => request(`/orders/buyer/${orderId}/cancel`, { method: "PATCH" }),
  removeOrder: (orderId) => request(`/orders/buyer/${orderId}`, { method: "DELETE" }),
  rateSeller: (payload) => request("/orders/buyer/ratings/seller", { method: "POST", body: JSON.stringify(payload) }),
  addComment: (payload) => request("/comments", { method: "POST", body: JSON.stringify(payload) }),
  summary: (productId) => request(`/comments/product/${productId}/summarize`),
  flagUser: (payload) => request("/flags", { method: "POST", body: JSON.stringify(payload) }),
  myFlags: () => request("/flags/buyer/my-flags"),
  buyerProfile: () => request("/users/buyer/me/profile"),
  updateBuyerProfile: (payload) => request("/users/buyer/me/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  addAddress: (payload) => request("/users/buyer/me/addresses", { method: "POST", body: JSON.stringify(payload) }),
  deleteAddress: (addressId) => request(`/users/buyer/me/addresses/${addressId}`, { method: "DELETE" }),
  cart: () => request("/users/buyer/me/cart"),
  addCartItem: (payload) => request("/users/buyer/me/cart/items", { method: "POST", body: JSON.stringify(payload) }),
  updateCartItem: (productId, quantity) => request(`/users/buyer/me/cart/items/${productId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCartItem: (productId) => request(`/users/buyer/me/cart/items/${productId}`, { method: "DELETE" }),
  clearCart: () => request("/users/buyer/me/cart", { method: "DELETE" }),
  checkoutCart: (payload = {}) => request("/users/buyer/me/cart/checkout", { method: "POST", body: JSON.stringify(payload) }),
  wishlist: () => request("/users/buyer/me/wishlist"),
  addWishlistItem: (productId) => request(`/users/buyer/me/wishlist/${productId}`, { method: "POST" }),
  removeWishlistItem: (productId) => request(`/users/buyer/me/wishlist/${productId}`, { method: "DELETE" })
};