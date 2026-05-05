import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, getUser, logout, saveAuth } from "./api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

const STATUS_SEQUENCE = ["Placed", "Processing", "Preparing", "Shipping", "Delivered"];
const LATE_DELIVERY_GRACE_DAYS = 3;

function money(value) {
  const number = Number(value || 0);
  return `$${number.toFixed(2)}`;
}

function stars(rating) {
  const value = Math.max(0, Math.min(5, Number(rating || 0)));
  const rounded = Math.round(value * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  return "★".repeat(full) + (half ? "⯨" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}

function resolveImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (String(path).startsWith("/uploads/")) return `${API_ORIGIN}${path}`;
  return String(path);
}

function formatDate(input) {
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function addDays(input, days) {
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + days);
  return dt;
}

function resolveExpectedDeliveryDate(order) {
  if (order?.expectedDeliveryDate) {
    const fromOrder = new Date(order.expectedDeliveryDate);
    if (!Number.isNaN(fromOrder.getTime())) return fromOrder;
  }

  return addDays(order?.createdAt || new Date().toISOString(), Number(order?.expectedDeliveryDays || 3));
}

function canFlagLateDelivery(order) {
  if (!order) return false;
  const expected = resolveExpectedDeliveryDate(order);
  if (!expected) return false;
  const deadline = addDays(expected, LATE_DELIVERY_GRACE_DAYS);
  if (!deadline) return false;

  if (order.status === "Delivered") {
    return new Date(order.updatedAt || order.createdAt || Date.now()) > deadline;
  }

  return new Date() > deadline;
}

function getDiscountedPrice(price, discountPercentage) {
  const basePrice = Number(price || 0);
  const discount = Number(discountPercentage || 0);
  if (discount <= 0 || discount >= 100) return basePrice;
  return basePrice * (1 - discount / 100);
}

function getTrackingTimeline(order) {
  const createdAt = order?.createdAt || new Date().toISOString();
  const currentIndex = STATUS_SEQUENCE.indexOf(order?.status);
  const expectedDate = resolveExpectedDeliveryDate(order);
  const createdDate = new Date(createdAt);
  const totalDays = Math.max(1, Number(order?.expectedDeliveryDays || 3));
  const checkpoints = {
    Placed: 0,
    Processing: Math.max(1, Math.round(totalDays * 0.25)),
    Preparing: Math.max(1, Math.round(totalDays * 0.5)),
    Shipping: Math.max(1, Math.round(totalDays * 0.8)),
    Delivered: totalDays
  };

  return STATUS_SEQUENCE.map((status, index) => {
    const estimate = status === "Delivered"
      ? expectedDate
      : addDays(createdDate, checkpoints[status] || 0);
    return {
      status,
      isActive: currentIndex >= index,
      isCurrent: order?.status === status,
      dateLabel: estimate ? formatDate(estimate) : "Unknown"
    };
  });
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = mode === "register"
        ? { name: form.name, email: form.email, password: form.password, role: "buyer" }
        : { email: form.email, password: form.password };

      const result = mode === "register" ? await api.register(payload) : await api.login(payload);
      saveAuth(result.token, result.user);
      onAuthed(result.user);
    } catch (err) {
      setError(err.message || "Authentication failed");
    }
  }

  return (
    <main className="auth-wrapper">
      <section className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">{mode === "login" ? "🔐" : "✨"}</div>
        </div>
        <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="auth-subtitle">{mode === "login" ? "Sign in to your buyer account" : "Create your buyer account"}</p>

        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === "register" ? (
            <div className="form-group">
              <label className="form-label" htmlFor="buyer-name">Full Name</label>
              <input
                id="buyer-name"
                className="form-input"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label" htmlFor="buyer-email">Email</label>
            <input
              id="buyer-email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="buyer-password">Password</label>
            <input
              id="buyer-password"
              type="password"
              className="form-input"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button type="submit" className="btn-primary">
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          {mode === "login" ? "No account?" : "Already registered?"}{" "}
          <button type="button" className="link-btn" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}

const ProductCard = memo(function ProductCard({ product, inWishlist, onAddToCart, onToggleWishlist, onOrderNow, onOpenDetails }) {
  return (
    <article className="product-card" role="button" tabIndex={0} onClick={() => onOpenDetails(product)} onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        onOpenDetails(product);
      }
    }}>
      <div className="product-badge">{product.category || "General"}</div>
      <img className="product-img" src={resolveImageUrl(product.imageUrl)} alt={product.name} loading="lazy" decoding="async" />
      <div className="product-title">{product.name}</div>
      <div className="product-rating">
        <span className="stars">{stars(product.ratings)}</span>
        <span className="rating-value">({Number(product.ratings || 0).toFixed(1)})</span>
      </div>
      {Number(product.discountPercentage || 0) > 0 ? (
        <div className="product-price-section">
          <span className="product-price-original">{money(product.price)}</span>
          <span className="product-price-discounted">{money(getDiscountedPrice(product.price, product.discountPercentage))}</span>
          <span className="product-discount-badge">{Math.round(Number(product.discountPercentage || 0))}% OFF</span>
        </div>
      ) : (
        <div className="product-price">{money(product.price)}</div>
      )}
      <div className="product-meta" style={{ marginTop: 6 }}>
        <span className="meta-badge">Expected delivery: {Math.max(1, Number(product.deliveryDays || 3))} day(s)</span>
      </div>

      <div className="product-actions">
        <button type="button" className="btn order-btn" onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}>Add to Cart</button>
        <button type="button" className="btn" style={{ background: inWishlist ? "#fecdd3" : "#e2e8f0", marginTop: 8 }} onClick={(e) => { e.stopPropagation(); onToggleWishlist(product); }}>
          {inWishlist ? "Remove Wishlist" : "Wishlist"}
        </button>
      </div>
    </article>
  );
});

function BuyerAppShell() {
  const user = getUser();
  const [screen, setScreen] = useState("home");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({ items: [], subtotal: 0, itemCount: 0 });
  const [wishlist, setWishlist] = useState([]);
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "", phone: "", addresses: [] });
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", city: "", country: "", postalCode: "", isDefault: false });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [orderFilter, setOrderFilter] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState("Cash on Delivery");
  const [cardDetails, setCardDetails] = useState({ cardNumber: "", cardHolder: "", cardExpiry: "", cardCVV: "" });
  const [reportForm, setReportForm] = useState({ orderId: "", sellerId: "", reasonType: "Late Delivery", reason: "" });
  const [myFlags, setMyFlags] = useState([]);
  const [reportTab, setReportTab] = useState("submit");
  const [ratingForms, setRatingForms] = useState({});
  const [toasts, setToasts] = useState([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [trackingOrderId, setTrackingOrderId] = useState("");
  const [productDetail, setProductDetail] = useState(null);
  const [productReview, setProductReview] = useState({ rating: 5, text: "" });
  const [aiSummary, setAiSummary] = useState({ text: "", loading: false, error: "" });

  const pushToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  async function refreshAll() {
    try {
      const [productsData, ordersData, cartData, wishlistData, profileData, flagsData] = await Promise.all([
        api.products(),
        api.buyerOrders(),
        api.cart(),
        api.wishlist(),
        api.buyerProfile(),
        api.myFlags().catch(() => [])
      ]);

      setProducts(Array.isArray(productsData) ? productsData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setCart(cartData || { items: [], subtotal: 0, itemCount: 0 });
      setWishlist(Array.isArray(wishlistData) ? wishlistData : []);
      setMyFlags(Array.isArray(flagsData) ? flagsData : []);
      setProfile((prev) => ({
        ...prev,
        name: profileData?.name || prev.name,
        email: profileData?.email || prev.email,
        phone: profileData?.phone || "",
        addresses: Array.isArray(profileData?.addresses) ? profileData.addresses : []
      }));
    } catch (err) {
      pushToast(err.message || "Failed to load buyer data", "error");
    }
  }

  useEffect(() => {
    if (!user?.id) return;
    refreshAll();
  }, [user?.id]);

  const categories = useMemo(() => {
    const raw = Array.from(new Set(products.map((product) => product.category || "General"))).sort();
    return ["All", ...raw];
  }, [products]);

  const wishlistSet = useMemo(() => new Set(wishlist.map((item) => String(item._id))), [wishlist]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minPrice === "" ? 0 : Number(minPrice);
    const max = maxPrice === "" ? Number.POSITIVE_INFINITY : Number(maxPrice);
    const rating = Number(minRating || 0);

    return products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const cat = String(product.category || "General").toLowerCase();
      const price = Number(product.price || 0);
      const productRating = Number(product.ratings || 0);

      const matchesQuery = !q || name.includes(q) || cat.includes(q);
      const matchesCategory = category === "All" || String(product.category || "General") === category;
      const matchesPrice = price >= min && price <= max;
      const matchesRating = productRating >= rating;

      return matchesQuery && matchesCategory && matchesPrice && matchesRating;
    });
  }, [products, query, category, minPrice, maxPrice, minRating]);

  useEffect(() => {
    setVisibleCount(12);
  }, [query, category, minPrice, maxPrice, minRating]);

  const displayedProducts = useMemo(() => filteredProducts.slice(0, visibleCount), [filteredProducts, visibleCount]);

  const displayedOrders = useMemo(() => {
    return orders.filter((order) => orderFilter === "All" || order.status === orderFilter);
  }, [orders, orderFilter]);

  const selectedReportOrder = orders.find((order) => String(order._id) === String(reportForm.orderId));
  const trackingOrder = orders.find((order) => String(order._id) === String(trackingOrderId)) || null;

  const reportSellerOptions = useMemo(() => {
    if (!selectedReportOrder) return [];

    const map = new Map();
    for (const item of selectedReportOrder.itemsDetailed || []) {
      const key = String(item.sellerId || selectedReportOrder.sellerId || "");
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          sellerId: key,
          sellerName: item.sellerName || selectedReportOrder.sellerName || "Seller"
        });
      }
    }

    if (!map.size && selectedReportOrder.sellerId) {
      map.set(String(selectedReportOrder.sellerId), {
        sellerId: String(selectedReportOrder.sellerId),
        sellerName: selectedReportOrder.sellerName || "Seller"
      });
    }

    return Array.from(map.values());
  }, [selectedReportOrder]);

  const applyOptimisticCartAdd = useCallback((product, quantity = 1) => {
    setCart((prev) => {
      const existingIndex = prev.items.findIndex((item) => String(item.productId) === String(product._id));
      const nextItems = [...prev.items];

      if (existingIndex >= 0) {
        const current = nextItems[existingIndex];
        const nextQty = Number(current.quantity || 0) + quantity;
        nextItems[existingIndex] = {
          ...current,
          quantity: nextQty,
          lineTotal: Number(current.unitPrice || 0) * nextQty
        };
      } else {
        const unitPrice = Number(product.price || 0);
        nextItems.push({
          productId: product._id,
          productName: product.name,
          category: product.category || "General",
          imageUrl: product.imageUrl || "",
          sellerId: product.sellerId,
          unitPrice,
          quantity,
          lineTotal: unitPrice * quantity,
          availableInventory: Number(product.inventory || 0)
        });
      }

      const subtotal = nextItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      const itemCount = nextItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return { items: nextItems, subtotal, itemCount };
    });
  }, []);

  const onAddToCart = useCallback(async (product) => {
    const snapshot = cart;
    applyOptimisticCartAdd(product, 1);

    try {
      const payload = await api.addCartItem({ productId: product._id, quantity: 1 });
      setCart(payload);
      pushToast("Added to cart", "success");
    } catch (err) {
      setCart(snapshot);
      pushToast(err.message || "Failed to add item to cart", "error");
    }
  }, [applyOptimisticCartAdd, cart, pushToast]);

  const onToggleWishlist = useCallback(async (product) => {
    const productId = String(product._id);
    const isInWishlist = wishlistSet.has(productId);
    const snapshot = wishlist;

    if (isInWishlist) {
      setWishlist((prev) => prev.filter((item) => String(item._id) !== productId));
    } else {
      setWishlist((prev) => [product, ...prev]);
    }

    try {
      if (isInWishlist) {
        await api.removeWishlistItem(product._id);
        pushToast("Removed from wishlist", "info");
      } else {
        await api.addWishlistItem(product._id);
        pushToast("Saved to wishlist", "success");
      }
    } catch (err) {
      setWishlist(snapshot);
      pushToast(err.message || "Failed to update wishlist", "error");
    }
  }, [wishlist, wishlistSet, pushToast]);

  const onOrderNow = useCallback(async (product) => {
    try {
      await api.placeOrder([{ productId: product._id, quantity: 1 }], paymentMethod);
      await refreshAll();
      setScreen("orders");
      pushToast("Order placed", "success");
    } catch (err) {
      pushToast(err.message || "Failed to place order", "error");
    }
  }, [paymentMethod, pushToast]);

  const onOpenDetails = useCallback(async (product) => {
    setProductDetail({ product, comments: [], loading: true });
    setProductReview({ rating: 5, text: "" });

    try {
      const detail = await api.productDetails(product._id);
      const ownReview = Array.isArray(detail?.comments)
        ? detail.comments.find((comment) => String(comment.userId) === String(user?.id))
        : null;
      setProductDetail({
        product: detail?.product || product,
        comments: Array.isArray(detail?.comments) ? detail.comments : [],
        ownReview,
        loading: false
      });
      if (ownReview) {
        setProductReview({
          rating: Number(ownReview.rating || 5),
          text: String(ownReview.text || "")
        });
      }
    } catch (err) {
      setProductDetail({ product, comments: [], loading: false });
      pushToast(err.message || "Failed to load product details", "error");
    }
  }, [pushToast, user?.id]);

  async function submitProductReview() {
    if (!productDetail?.product?._id) return;
    const reviewText = String(productReview.text || "").trim() || `Product rating: ${productReview.rating}/5`;

    try {
      await api.addComment({
        productId: productDetail.product._id,
        text: reviewText,
        rating: Number(productReview.rating || 5)
      });
      const refreshed = await api.productDetails(productDetail.product._id);
      setProductDetail({
        product: refreshed?.product || productDetail.product,
        comments: Array.isArray(refreshed?.comments) ? refreshed.comments : [],
        loading: false
      });
      pushToast("Product rated", "success");
    } catch (err) {
      pushToast(err.message || "Failed to rate product", "error");
    }
  }

  function closeProductDetail() {
    setProductDetail(null);
    setProductReview({ rating: 5, text: "" });
    setAiSummary({ text: "", loading: false, error: "" });
  }

  async function fetchAiSummary(productId) {
    setAiSummary({ text: "", loading: true, error: "" });
    try {
      const result = await api.summary(productId);
      setAiSummary({ text: result.summary, loading: false, error: "", aiGenerated: result.aiGenerated, sampleSize: result.sampleSize, averageRating: result.averageRating });
    } catch (err) {
      setAiSummary({ text: "", loading: false, error: err.message || "Failed to generate summary" });
    }
  }

  async function updateCartQuantity(productId, quantity) {
    const previous = cart;

    if (quantity <= 0) {
      setCart((prev) => {
        const items = prev.items.filter((item) => String(item.productId) !== String(productId));
        const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
        const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        return { items, subtotal, itemCount };
      });
    } else {
      setCart((prev) => {
        const items = prev.items.map((item) => {
          if (String(item.productId) !== String(productId)) return item;
          const unitPrice = Number(item.unitPrice || 0);
          return {
            ...item,
            quantity,
            lineTotal: unitPrice * quantity
          };
        });

        const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
        const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        return { items, subtotal, itemCount };
      });
    }

    try {
      const payload = await api.updateCartItem(productId, quantity);
      setCart(payload);
    } catch (err) {
      setCart(previous);
      pushToast(err.message || "Failed to update cart item", "error");
    }
  }

  async function removeCartItem(productId) {
    const previous = cart;
    setCart((prev) => {
      const items = prev.items.filter((item) => String(item.productId) !== String(productId));
      const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return { items, subtotal, itemCount };
    });

    try {
      const payload = await api.removeCartItem(productId);
      setCart(payload);
      pushToast("Removed from cart", "info");
    } catch (err) {
      setCart(previous);
      pushToast(err.message || "Failed to remove cart item", "error");
    }
  }

  async function clearCart() {
    const previous = cart;
    setCart({ items: [], subtotal: 0, itemCount: 0 });
    try {
      const payload = await api.clearCart();
      setCart(payload);
      pushToast("Cart cleared", "info");
    } catch (err) {
      setCart(previous);
      pushToast(err.message || "Failed to clear cart", "error");
    }
  }

  async function checkoutCart() {
    try {
      if (!cart.itemCount) {
        pushToast("Your cart is empty", "info");
        return;
      }
      if (paymentMethod === "Credit Card") {
        const { cardNumber, cardHolder, cardExpiry, cardCVV } = cardDetails;
        if (!cardNumber || !cardHolder || !cardExpiry || !cardCVV) {
          pushToast("Please fill in all credit card details", "error");
          return;
        }
      }
      const payload = { paymentMethod };
      if (paymentMethod === "Credit Card") payload.cardDetails = cardDetails;
      await api.checkoutCart(payload);
      await refreshAll();
      setScreen("orders");
      pushToast("Checkout successful", "success");
    } catch (err) {
      pushToast(err.message || "Failed to checkout cart", "error");
    }
  }

  async function cancelOrRemoveOrder(order) {
    if (!order?._id) return;

    if (order.status === "Cancelled") {
      const previous = orders;
      setOrders((prev) => prev.filter((item) => String(item._id) !== String(order._id)));

      try {
        await api.removeOrder(order._id);
        pushToast("Cancelled order removed", "info");
      } catch (err) {
        setOrders(previous);
        pushToast(err.message || "Failed to remove order", "error");
      }
      return;
    }

    try {
      await api.cancelOrder(order._id);
      const nextOrders = await api.buyerOrders();
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      pushToast("Order cancelled", "info");
    } catch (err) {
      pushToast(err.message || "Failed to cancel order", "error");
    }
  }

  async function submitSellerRating(order) {
    try {
      const form = ratingForms[order._id] || { rating: 5, comment: "" };
      await api.rateSeller({
        orderId: order._id,
        sellerId: order.sellerId,
        rating: Number(form.rating || 5),
        comment: String(form.comment || "").trim()
      });

      const nextOrders = await api.buyerOrders();
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      pushToast("Seller rating submitted", "success");
    } catch (err) {
      pushToast(err.message || "Failed to rate seller", "error");
    }
  }

  async function submitProfile() {
    try {
      const payload = {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        addresses: profile.addresses
      };
      const updated = await api.updateBuyerProfile(payload);
      setProfile((prev) => ({ ...prev, ...updated }));
      pushToast("Profile updated", "success");
    } catch (err) {
      pushToast(err.message || "Failed to update profile", "error");
    }
  }

  async function addAddress() {
    try {
      const addresses = await api.addAddress(newAddress);
      setProfile((prev) => ({ ...prev, addresses: Array.isArray(addresses) ? addresses : prev.addresses }));
      setNewAddress({ label: "Home", line1: "", city: "", country: "", postalCode: "", isDefault: false });
      pushToast("Address added", "success");
    } catch (err) {
      pushToast(err.message || "Failed to add address", "error");
    }
  }

  async function deleteAddress(addressId) {
    try {
      const addresses = await api.deleteAddress(addressId);
      setProfile((prev) => ({ ...prev, addresses: Array.isArray(addresses) ? addresses : prev.addresses }));
      pushToast("Address deleted", "info");
    } catch (err) {
      pushToast(err.message || "Failed to delete address", "error");
    }
  }

  async function submitReport() {
    try {
      if (!reportForm.orderId || !reportForm.sellerId || !reportForm.reason.trim()) {
        pushToast("Please select an order, a seller, and provide a reason", "info");
        return;
      }

      await api.flagUser({
        reportedUserId: reportForm.sellerId,
        reason: reportForm.reasonType,
        details: reportForm.reason,
        orderId: reportForm.orderId
      });

      setReportForm({ orderId: "", sellerId: "", reasonType: "Late Delivery", reason: "" });
      const flagsData = await api.myFlags().catch(() => []);
      setMyFlags(Array.isArray(flagsData) ? flagsData : []);
      pushToast("Report submitted successfully", "success");
      setReportTab("history");
    } catch (err) {
      pushToast(err.message || "Failed to submit report", "error");
    }
  }

  const totalSpent = orders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
  const deliveredCount = orders.filter((order) => order.status === "Delivered").length;

  if (!user) return <Navigate to="/" replace />;

  return (
    <>
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>{toast.message}</div>
        ))}
      </div>

      <div className={`screen ${screen === "home" ? "active" : ""}`} id="home">
        {screen === "home" ? (
          <div>
            <div className="buyer-hero">
              <div className="buyer-hero__greeting">Welcome back</div>
              <div className="buyer-hero__name">{user.name || "Buyer"}</div>
            </div>

            <div className="buyer-stats">
              <div className="stat-card"><div className="stat-card__value">{orders.length}</div><div className="stat-card__label">Orders</div></div>
              <div className="stat-card"><div className="stat-card__value">{money(totalSpent)}</div><div className="stat-card__label">Total spent</div></div>
              <div className="stat-card"><div className="stat-card__value">{deliveredCount}</div><div className="stat-card__label">Delivered</div></div>
            </div>

            <h1 className="header">Home</h1>
            <input className="search-bar" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or category" />

            <div className="categories" role="tablist" aria-label="Category filter">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="category"
                  onClick={() => setCategory(item)}
                  style={{ border: "none", outline: "none", background: item === category ? "#eaf0ff" : "white" }}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="filter-grid">
              <input className="form-input" type="number" min="0" placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <input className="form-input" type="number" min="0" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
              <select className="form-input" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
                <option value="0">All ratings</option>
                <option value="1">1+ stars</option>
                <option value="2">2+ stars</option>
                <option value="3">3+ stars</option>
                <option value="4">4+ stars</option>
                <option value="5">5 stars</option>
              </select>
            </div>

            <div className="product-grid">
              {displayedProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  inWishlist={wishlistSet.has(String(product._id))}
                  onAddToCart={onAddToCart}
                  onToggleWishlist={onToggleWishlist}
                  onOrderNow={onOrderNow}
                  onOpenDetails={onOpenDetails}
                />
              ))}
            </div>

            {filteredProducts.length > visibleCount ? (
              <button type="button" className="btn btn-load-more" onClick={() => setVisibleCount((prev) => prev + 12)}>
                Load More Products
              </button>
            ) : null}

            {!filteredProducts.length ? <div className="product-details" style={{ marginTop: 16 }}>No products match the selected filters.</div> : null}
          </div>
        ) : null}
      </div>

      {productDetail ? (
        <div className="detail-overlay" role="presentation" onClick={closeProductDetail}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-label="Product details" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="detail-close" onClick={closeProductDetail}>×</button>
            {productDetail.loading ? (
              <div className="product-details">Loading product details...</div>
            ) : (
              <>
                <div className="detail-grid">
                  <img className="detail-image" src={resolveImageUrl(productDetail.product?.imageUrl)} alt={productDetail.product?.name || "Product"} />
                  <div>
                    <div className="product-badge">{productDetail.product?.category || "General"}</div>
                    <h2 className="detail-title">{productDetail.product?.name}</h2>
                    {Number(productDetail.product?.discountPercentage || 0) > 0 ? (
                      <div className="detail-price-section">
                        <span className="detail-price-original">{money(productDetail.product?.price)}</span>
                        <span className="detail-price-discounted">{money(getDiscountedPrice(productDetail.product?.price, productDetail.product?.discountPercentage))}</span>
                        <span className="detail-discount-badge">{Math.round(Number(productDetail.product?.discountPercentage || 0))}% OFF</span>
                      </div>
                    ) : (
                      <p className="detail-price">{money(productDetail.product?.price)}</p>
                    )}
                    <p className="detail-copy">{productDetail.product?.description || "No description provided by the seller."}</p>
                    <p className="detail-copy" style={{ fontWeight: 700 }}>
                      Expected delivery: {Math.max(1, Number(productDetail.product?.deliveryDays || 3))} day(s)
                    </p>

                    <div className="detail-seller">
                      <strong>Seller info</strong>
                      <p><span className="detail-label">Seller name:</span> {productDetail.product?.sellerName || "Seller"}</p>
                      <p><span className="detail-label">Business name:</span> {productDetail.product?.sellerBusinessName || "Not provided"}</p>
                      {productDetail.product?.sellerEmail ? <p><span className="detail-label">Email:</span> {productDetail.product.sellerEmail}</p> : null}
                      {productDetail.product?.sellerSupportEmail ? <p><span className="detail-label">Support email:</span> {productDetail.product.sellerSupportEmail}</p> : null}
                      {productDetail.product?.sellerPhone ? <p><span className="detail-label">Phone:</span> {productDetail.product.sellerPhone}</p> : null}
                      {(productDetail.product?.sellerCity || productDetail.product?.sellerCountry) ? <p>{[productDetail.product?.sellerCity, productDetail.product?.sellerCountry].filter(Boolean).join(", ")}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="detail-actions">
                  <button type="button" className="btn order-btn" onClick={() => onAddToCart(productDetail.product)}>Add to Cart</button>
                </div>

                <div className="detail-rating">
                  <h3>Rate this product</h3>
                  {productDetail.ownReview ? <p className="detail-copy">Your existing review will be updated if you change the rating.</p> : null}
                  <div className="form-group">
                    <label className="form-label" htmlFor="product-rating">Rating</label>
                    <select id="product-rating" className="search-bar" value={productReview.rating} onChange={(e) => setProductReview((prev) => ({ ...prev, rating: Number(e.target.value) }))}>
                      <option value="1">1 Star</option>
                      <option value="2">2 Stars</option>
                      <option value="3">3 Stars</option>
                      <option value="4">4 Stars</option>
                      <option value="5">5 Stars</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="product-review-text">Comment</label>
                    <textarea id="product-review-text" className="comment-box" rows={3} value={productReview.text} onChange={(e) => setProductReview((prev) => ({ ...prev, text: e.target.value }))} placeholder="Tell us what you think about this product" />
                  </div>
                  <button type="button" className="btn rate-btn" onClick={submitProductReview}>Submit Product Rating</button>
                </div>

                <div className="detail-comments">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Recent reviews</h3>
                    {Array.isArray(productDetail.comments) && productDetail.comments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => fetchAiSummary(productDetail.product._id)}
                        disabled={aiSummary.loading}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: aiSummary.loading ? "#e2e8f0" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                          color: aiSummary.loading ? "#9ca3af" : "white",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: aiSummary.loading ? "not-allowed" : "pointer"
                        }}
                      >
                        {aiSummary.loading ? "⏳ Summarizing..." : "✨ AI Summary"}
                      </button>
                    )}
                  </div>

                  {/* AI Summary Result */}
                  {aiSummary.error && (
                    <div style={{ padding: "10px 14px", background: "#fee2e2", borderRadius: 8, color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
                      {aiSummary.error}
                    </div>
                  )}
                  {aiSummary.text && !aiSummary.loading && (
                    <div style={{
                      marginBottom: 16,
                      padding: "14px 16px",
                      background: "linear-gradient(135deg, #ede9fe, #dbeafe)",
                      borderRadius: 10,
                      border: "1px solid #c4b5fd"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 16 }}>✨</span>
                        <strong style={{ fontSize: 13, color: "#5b21b6" }}>
                          AI Summary — {aiSummary.sampleSize} review{aiSummary.sampleSize !== 1 ? "s" : ""} · avg {aiSummary.averageRating}/5 ⭐
                        </strong>
                        {aiSummary.aiGenerated && (
                          <span style={{ marginLeft: "auto", fontSize: 10, background: "#8b5cf6", color: "white", padding: "2px 6px", borderRadius: 8, fontWeight: 600 }}>
                            Powered by Groq AI (Llama 3.1)
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{aiSummary.text}</p>
                    </div>
                  )}

                  {Array.isArray(productDetail.comments) && productDetail.comments.length ? productDetail.comments.slice(0, 4).map((comment) => (
                    <article key={comment._id} className="detail-comment">
                      <div className="detail-comment__meta">
                        <span className="stars">{stars(comment.rating)}</span>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p>{comment.text}</p>
                    </article>
                  )) : <p className="detail-empty">No reviews yet.</p>}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      <div className={`screen ${screen === "cart" ? "active" : ""}`} id="cart">
        {screen === "cart" ? (
          <div>
            <h1 className="header">Cart</h1>
            {cart.items.length ? cart.items.map((item) => (
              <article key={String(item.productId)} className="order-card">
                <h2 className="order-card__title">{item.productName}</h2>
                <img className="mini-product-img" src={resolveImageUrl(item.imageUrl)} alt={item.productName} loading="lazy" decoding="async" />
                <p style={{ color: "var(--text-muted)" }}>Seller: {item.sellerId}</p>
                <p style={{ marginTop: 6, marginBottom: 10 }}>{money(item.unitPrice)} x {item.quantity} = <strong>{money(item.lineTotal)}</strong></p>
                <div className="quantity-row">
                  <button type="button" className="qty-btn" onClick={() => updateCartQuantity(item.productId, Math.max(0, item.quantity - 1))}>-</button>
                  <span>{item.quantity}</span>
                  <button type="button" className="qty-btn" onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}>+</button>
                </div>
                <button type="button" className="btn" style={{ background: "#fee2e2", marginTop: 12 }} onClick={() => removeCartItem(item.productId)}>Remove</button>
              </article>
            )) : <div className="product-details">Your cart is empty.</div>}

            <div className="product-details" style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 10 }}>Payment and Checkout</h2>
              <select className="search-bar" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setCardDetails({ cardNumber: "", cardHolder: "", cardExpiry: "", cardCVV: "" }); }}>
                <option>Cash on Delivery</option>
                <option>Credit Card</option>
              </select>

              {paymentMethod === "Credit Card" && (
                <div style={{ marginTop: 12, padding: 14, background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
                  <p style={{ fontWeight: 600, marginBottom: 10 }}>💳 Credit Card Details</p>
                  <input
                    className="search-bar"
                    placeholder="Card Number (16 digits)"
                    maxLength={19}
                    value={cardDetails.cardNumber}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                      const formatted = raw.replace(/(.{4})/g, "$1 ").trim();
                      setCardDetails((prev) => ({ ...prev, cardNumber: formatted }));
                    }}
                    style={{ marginBottom: 8 }}
                  />
                  <input
                    className="search-bar"
                    placeholder="Card Holder Name"
                    value={cardDetails.cardHolder}
                    onChange={(e) => setCardDetails((prev) => ({ ...prev, cardHolder: e.target.value }))}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="search-bar"
                      placeholder="MM/YY"
                      maxLength={5}
                      value={cardDetails.cardExpiry}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "").slice(0, 4);
                        if (val.length >= 3) val = val.slice(0, 2) + "/" + val.slice(2);
                        setCardDetails((prev) => ({ ...prev, cardExpiry: val }));
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="search-bar"
                      placeholder="CVV"
                      maxLength={4}
                      type="password"
                      value={cardDetails.cardCVV}
                      onChange={(e) => setCardDetails((prev) => ({ ...prev, cardCVV: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              )}

              <p style={{ marginBottom: 12, marginTop: 12 }}>Subtotal: <strong>{money(cart.subtotal)}</strong></p>
              <button type="button" className="btn order-btn" onClick={checkoutCart}>Process Order</button>
              <button type="button" className="btn" style={{ background: "#e2e8f0", marginTop: 10 }} onClick={clearCart}>Clear Cart</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={`screen ${screen === "orders" ? "active" : ""}`} id="orders">
        {screen === "orders" ? (
          <div>
            <h1 className="header">Orders</h1>
            <div className="categories" aria-label="Order filters">
              {["All", "Placed", "Processing", "Preparing", "Shipping", "Delivered", "Cancelled"].map((item) => (
                <button key={item} type="button" className="category" onClick={() => setOrderFilter(item)} style={{ border: "none", outline: "none", background: item === orderFilter ? "#eaf0ff" : "white" }}>{item}</button>
              ))}
            </div>

            {displayedOrders.length ? displayedOrders.map((order) => (
              <article key={order._id} className="order-card">
                <div className="order-card__header">
                  <div className="order-card__image-container">
                    <img 
                      className="order-card__image" 
                      src={resolveImageUrl(order.itemsDetailed?.[0]?.imageUrl || "")} 
                      alt={order.productName || "Product"}
                    />
                  </div>
                  <div className="order-card__content">
                    <h3 className="order-card__title">{order.productName || `Order ${String(order._id).slice(-6)}`}</h3>
                    <div className="order-card__meta">
                      <div className={`order-status ${order.status === "Delivered" ? "order-status--delivered" : order.status === "Cancelled" ? "order-status--cancelled" : order.status === "Shipping" ? "order-status--shipping" : "order-status--processing"}`}>
                        {order.status}
                      </div>
                      <span className="order-card__meta-item">📦 Order #{String(order._id).slice(-6)}</span>
                    </div>
                    <div className="order-card__meta">
                      <span className="order-card__meta-item">Seller: <span className="order-card__seller">{order.sellerName || order.sellerId}</span></span>
                    </div>
                    <div className="order-card__price-info">
                      <span className="order-card__price">{money(order.totalPrice)}</span>
                      <span className="order-card__delivery">📅 {formatDate(resolveExpectedDeliveryDate(order))}</span>
                    </div>
                  </div>
                </div>

                <div className="order-card__tracking">
                  <div className={`order-card__tracking-step ${["Placed", "Processing", "Preparing", "Shipping", "Delivered"].includes(order.status) ? "active" : ""}`}>
                    <div className="order-card__tracking-dot" />
                    <div>Placed</div>
                  </div>
                  <div className={`order-card__tracking-step ${["Processing", "Preparing", "Shipping", "Delivered"].includes(order.status) ? "active" : ""}`}>
                    <div className="order-card__tracking-dot" />
                    <div>Processing</div>
                  </div>
                  <div className={`order-card__tracking-step ${["Preparing", "Shipping", "Delivered"].includes(order.status) ? "active" : ""}`}>
                    <div className="order-card__tracking-dot" />
                    <div>Preparing</div>
                  </div>
                  <div className={`order-card__tracking-step ${order.status === "Delivered" ? "active" : ""}`}>
                    <div className="order-card__tracking-dot" />
                    <div>Delivered</div>
                  </div>
                </div>

                <div className="order-card__actions">
                  <button type="button" className="order-card__action-btn order-card__action-btn--primary" onClick={() => { setTrackingOrderId(order._id); setScreen("tracking"); }}>
                    Track
                  </button>
                  <button type="button" className="order-card__action-btn order-card__action-btn--secondary" onClick={() => { setReportForm({ ...reportForm, orderId: order._id, sellerId: order.sellerId }); setScreen("report"); }}>
                    Report
                  </button>
                  <button type="button" className="order-card__action-btn order-card__action-btn--danger" onClick={() => cancelOrRemoveOrder(order)}>
                    {order.status === "Cancelled" ? "Remove" : "Cancel"}
                  </button>
                </div>

                <div className="order-card__expanded">
                  <div className="order-card__rating-section">
                    <div className="order-card__rating-label">Rate Seller</div>
                    <select
                      className="order-card__rating-select"
                      value={String(ratingForms[order._id]?.rating || order.sellerRating?.rating || 5)}
                      onChange={(e) => setRatingForms((prev) => ({ ...prev, [order._id]: { ...(prev[order._id] || {}), rating: Number(e.target.value) } }))}
                    >
                      <option value="1">⭐ 1 Star</option>
                      <option value="2">⭐⭐ 2 Stars</option>
                      <option value="3">⭐⭐⭐ 3 Stars</option>
                      <option value="4">⭐⭐⭐⭐ 4 Stars</option>
                      <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
                    </select>
                    <textarea
                      className="order-card__comment-textarea"
                      placeholder="Share your feedback about this seller..."
                      value={ratingForms[order._id]?.comment ?? order.sellerRating?.comment ?? ""}
                      onChange={(e) => setRatingForms((prev) => ({ ...prev, [order._id]: { ...(prev[order._id] || {}), comment: e.target.value } }))}
                    />
                    <button type="button" className="order-card__action-btn order-card__action-btn--primary" style={{ marginTop: 10, width: "100%" }} onClick={() => submitSellerRating(order)}>
                      Submit Rating
                    </button>
                  </div>
                </div>
              </article>
            )) : <div className="order-card__no-orders">📭 No orders found for this filter.</div>}
          </div>
        ) : null}
      </div>

      <div className={`screen ${screen === "tracking" ? "active" : ""}`} id="tracking">
        {screen === "tracking" ? (
          <div>
            <h1 className="header">Tracking</h1>
            {!trackingOrder ? (
              <div className="product-details">Select an order from Orders to view full tracking timeline.</div>
            ) : (
              <div className="product-details">
                <h2 style={{ marginBottom: 6 }}>{trackingOrder.productName || `Order ${String(trackingOrder._id).slice(-6)}`}</h2>
                <p style={{ color: "var(--text-muted)", marginBottom: 14 }}>Order #{String(trackingOrder._id).slice(-8)}</p>

                <div className="timeline">
                  {getTrackingTimeline(trackingOrder).map((point) => (
                    <div key={point.status} className={`timeline-item ${point.isActive ? "active" : ""}`}>
                      <div className="timeline-dot" />
                      <div>
                        <div className="timeline-title">{point.status}{point.isCurrent ? " (Current)" : ""}</div>
                        <div className="timeline-date">Estimated: {point.dateLabel}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{ marginTop: 10, color: "var(--text-muted)" }}>
                  Expected by: <strong>{formatDate(resolveExpectedDeliveryDate(trackingOrder))}</strong>
                  {` (late flag allowed after +${LATE_DELIVERY_GRACE_DAYS} days)`}
                </p>

                {trackingOrder.status === "Cancelled" ? (
                  <p style={{ marginTop: 12, color: "#b91c1c", fontWeight: 700 }}>This order has been cancelled.</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={`screen ${screen === "wishlist" ? "active" : ""}`} id="wishlist">
        {screen === "wishlist" ? (
          <div>
            <h1 className="header">Wishlist</h1>
            {wishlist.length ? (
              <div className="product-grid">
                {wishlist.map((product) => (
                  <article key={product._id} className="product-card">
                    <div className="product-badge">{product.category || "General"}</div>
                    <img className="product-img" src={resolveImageUrl(product.imageUrl)} alt={product.name} loading="lazy" decoding="async" />
                    <div className="product-title">{product.name}</div>
                    <div className="product-price">{money(product.price)}</div>
                    <button type="button" className="btn order-btn" onClick={() => onAddToCart(product)}>Add to Cart</button>
                    <button type="button" className="btn" style={{ background: "#fee2e2", marginTop: 8 }} onClick={() => onToggleWishlist(product)}>Remove</button>
                  </article>
                ))}
              </div>
            ) : <div className="product-details">No products saved in wishlist.</div>}
          </div>
        ) : null}
      </div>

      <div className={`screen ${screen === "profile" ? "active" : ""}`} id="profile">
        {screen === "profile" ? (
          <div>
            <h1 className="header">Profile</h1>
            <div className="product-details">
              <div className="form-group">
                <label className="form-label" htmlFor="profile-name">Name</label>
                <input id="profile-name" className="form-input" value={profile.name || ""} onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label" htmlFor="profile-email">Email</label>
                <input id="profile-email" className="form-input" value={profile.email || ""} onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label" htmlFor="profile-phone">Phone</label>
                <input id="profile-phone" className="form-input" value={profile.phone || ""} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} />
              </div>

              <button type="button" className="btn order-btn" onClick={submitProfile}>Update Info</button>
            </div>

            <div className="product-details" style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 12 }}>Addresses</h2>
              {profile.addresses?.length ? profile.addresses.map((address) => (
                <div key={address._id} className="address-card">
                  <div>
                    <strong>{address.label || "Address"}</strong>
                    <p>{address.line1}, {address.city}, {address.country}</p>
                    {address.postalCode ? <p>{address.postalCode}</p> : null}
                    {address.isDefault ? <span className="product-badge">Default</span> : null}
                  </div>
                  <button type="button" className="btn" style={{ background: "#fee2e2", marginTop: 0, width: "auto" }} onClick={() => deleteAddress(address._id)}>Delete</button>
                </div>
              )) : <p style={{ color: "var(--text-muted)" }}>No addresses yet.</p>}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Add New Address</label>
                <input className="form-input" placeholder="Label" value={newAddress.label} onChange={(e) => setNewAddress((prev) => ({ ...prev, label: e.target.value }))} />
                <input className="form-input" placeholder="Address line" style={{ marginTop: 8 }} value={newAddress.line1} onChange={(e) => setNewAddress((prev) => ({ ...prev, line1: e.target.value }))} />
                <input className="form-input" placeholder="City" style={{ marginTop: 8 }} value={newAddress.city} onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))} />
                <input className="form-input" placeholder="Country" style={{ marginTop: 8 }} value={newAddress.country} onChange={(e) => setNewAddress((prev) => ({ ...prev, country: e.target.value }))} />
                <input className="form-input" placeholder="Postal code" style={{ marginTop: 8 }} value={newAddress.postalCode} onChange={(e) => setNewAddress((prev) => ({ ...prev, postalCode: e.target.value }))} />
                <label style={{ marginTop: 10, display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={newAddress.isDefault} onChange={(e) => setNewAddress((prev) => ({ ...prev, isDefault: e.target.checked }))} />
                  Set as default
                </label>
                <button type="button" className="btn" style={{ background: "#dbeafe", marginTop: 12 }} onClick={addAddress}>Add Address</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className={`screen ${screen === "report" ? "active" : ""}`} id="report">
        {screen === "report" ? (
          <div>
            <h1 className="header">Reports</h1>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["submit", "history"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={async () => {
                    setReportTab(tab);
                    if (tab === "history") {
                      try {
                        const flagsData = await api.myFlags();
                        setMyFlags(Array.isArray(flagsData) ? flagsData : []);
                      } catch (err) {
                        pushToast(err.message || "Failed to load reports", "error");
                      }
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: reportTab === tab ? "#1e3a5f" : "#e2e8f0",
                    color: reportTab === tab ? "white" : "#374151"
                  }}
                >
                  {tab === "submit" ? "🚩 Submit Report" : `📋 My Reports (${myFlags.length})`}
                </button>
              ))}
            </div>

            {reportTab === "history" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const flagsData = await api.myFlags();
                    setMyFlags(Array.isArray(flagsData) ? flagsData : []);
                  } catch (err) {
                    pushToast(err.message || "Failed to load reports", "error");
                  }
                }}
                style={{ marginBottom: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 13 }}
              >
                🔄 Refresh
              </button>
            )}

            {reportTab === "submit" ? (
              <div className="report-box">
                <div className="form-group">
                  <label htmlFor="report-order">Order</label>
                  <select id="report-order" className="search-bar" value={reportForm.orderId} onChange={(e) => {
                    setReportForm((prev) => ({ ...prev, orderId: e.target.value, sellerId: "" }));
                  }}>
                    <option value="">Select order</option>
                    {orders
                      .filter((o) => o.status !== "Cancelled")
                      .map((order) => (
                        <option key={order._id} value={order._id}>
                          #{String(order._id).slice(-6)} - {order.productName || "Order"} [{order.status}]
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="report-seller">Seller</label>
                  <select id="report-seller" className="search-bar" value={reportForm.sellerId} onChange={(e) => setReportForm((prev) => ({ ...prev, sellerId: e.target.value }))}>
                    <option value="">Select seller</option>
                    {reportSellerOptions.map((seller) => (
                      <option key={seller.sellerId} value={seller.sellerId}>{seller.sellerName}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="report-type">Report Type</label>
                  <select id="report-type" className="search-bar" value={reportForm.reasonType} onChange={(e) => setReportForm((prev) => ({ ...prev, reasonType: e.target.value }))}>
                    <option value="Late Delivery">Late Delivery</option>
                    <option value="Buyer Report">Other Seller Issue</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="report-reason">Details</label>
                  <textarea id="report-reason" rows={4} value={reportForm.reason} onChange={(e) => setReportForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Describe the issue in detail..." />
                </div>

                <button type="button" className="btn order-btn" onClick={submitReport}>Submit Report</button>
                <p className="report-notice">If an order has multiple sellers, choose the exact seller above before submitting.</p>
              </div>
            ) : (
              <div>
                {myFlags.length ? myFlags.map((flag) => {
                  const isFiled = String(flag.reportedBy?._id || flag.reportedBy) === String(user?.id);
                  const statusColors = {
                    Open: { background: "#fee2e2", color: "#b91c1c" },
                    UnderReview: { background: "#fef9c3", color: "#92400e" },
                    Resolved: { background: "#dcfce7", color: "#15803d" },
                    Dismissed: { background: "#f1f5f9", color: "#64748b" }
                  };
                  const style = statusColors[flag.status] || statusColors.Open;
                  return (
                    <div key={flag._id} className="order-card" style={{ borderLeft: `4px solid ${style.color}`, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <strong>{flag.reason}</strong>
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: isFiled ? "#dbeafe" : "#fce7f3",
                              color: isFiled ? "#1d4ed8" : "#be185d",
                              fontWeight: 600
                            }}>
                              {isFiled ? "📤 Filed by you" : "📥 Against you"}
                            </span>
                          </div>
                        </div>
                        <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, ...style }}>
                          {flag.status}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280", display: "flex", flexDirection: "column", gap: 3 }}>
                        {isFiled
                          ? <span>Against seller: <strong>{flag.reportedUserId?.name || "Unknown"}</strong></span>
                          : <span>Filed by: <strong>{flag.reportedBy?.name || "Unknown"}</strong></span>
                        }
                        {flag.orderId && <span>Order: <strong>#{String(flag.orderId).slice(-6)}</strong></span>}
                        {flag.details && <span>Details: {flag.details}</span>}
                        {flag.resolutionNote && (
                          <span style={{ color: "#15803d" }}>Resolution: {flag.resolutionNote}</span>
                        )}
                        <span>Submitted: {new Date(flag.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                    <div style={{ fontSize: 32 }}>📭</div>
                    <p>No reports submitted yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <nav className="nav">
        <a href="#" className={`nav__item ${screen === "home" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("home"); }}>Home</a>
        <a href="#" className={`nav__item ${screen === "cart" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("cart"); }}>Cart</a>
        <a href="#" className={`nav__item ${screen === "orders" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("orders"); }}>Orders</a>
        <a href="#" className={`nav__item ${screen === "tracking" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("tracking"); }}>Tracking</a>
        <a href="#" className={`nav__item ${screen === "wishlist" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("wishlist"); }}>Wishlist</a>
        <a href="#" className={`nav__item ${screen === "profile" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("profile"); }}>Profile</a>
        <a href="#" className={`nav__item ${screen === "report" ? "active" : ""}`} onClick={(e) => { e.preventDefault(); setScreen("report"); }}>Report</a>
        <button type="button" className="nav__item" onClick={() => { logout(); window.location.reload(); }}>Logout</button>
      </nav>
    </>
  );
}

export default function App() {
  const user = getUser();
  const [authed, setAuthed] = useState(!!user);

  if (!authed || !user) {
    return <AuthScreen onAuthed={() => setAuthed(true)} />;
  }

  if (user.role !== "buyer") {
    return <Navigate to="/" replace />;
  }

  return <BuyerAppShell />;
}