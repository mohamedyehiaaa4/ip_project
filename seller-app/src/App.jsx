import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import AddProductPage from "./pages/AddProductPage";
import ManageProductsPage from "./pages/ManageProductsPage";
import OrdersManagementPage from "./pages/OrdersManagementPage";
import FlagsReportsPage from "./pages/FlagsReportsPage";
import ProfilePage from "./pages/ProfilePage";
import AuthPage from "./pages/AuthPage";
import { api, getUser, hasSellerSession, logout } from "./api";

function SellerShell({ onLoggedOut }) {
  const user = getUser();
  const [tab, setTab] = useState("dashboard");
  const [showAddProduct, setShowAddProduct] = useState(false);

  useEffect(() => {
    // Validate saved token/session on startup to avoid stale auto-login state.
    api.myProfile().catch(() => {
      logout();
      onLoggedOut();
    });
  }, [onLoggedOut]);

  if (!hasSellerSession() || !user) return <Navigate to="/auth" replace />;

  return (
    <div>
      <div className="navbar">
        <div className="logo">
          <div className="logo-badge">📦</div>
          <span id="businessName">{user.businessName || "Seller Dashboard"}</span>
        </div>
        <div className="nav-links">
          <span onClick={() => { logout(); onLoggedOut(); }}>Logout</span>
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</button>
        <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Products</button>
        <button className={`nav-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>Orders</button>
        <button className={`nav-tab ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>Profile</button>
        <button className={`nav-tab ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>Flags / Reports</button>
      </div>

      <div id="alertContainer" />

      <div className={`section ${tab === "dashboard" ? "active" : ""}`} id="dashboardSection">
        <div className="container">
          <DashboardPage isActive={tab === "dashboard"} />
        </div>
      </div>

      <div className={`section ${tab === "products" ? "active" : ""}`} id="productsSection">
        <div className="container">
          <div className="header">
            <div className="header-title">
              <h1>My Products</h1>
              <p>Manage your inventory, pricing, and discounts</p>
            </div>
            <button className="btn-primary" onClick={() => setShowAddProduct(true)}>+ Add New Product</button>
          </div>

          <ManageProductsPage isActive={tab === "products"} />
        </div>
      </div>

      <div className={`section ${tab === "orders" ? "active" : ""}`} id="ordersSection">
        <div className="container">
          <OrdersManagementPage />
        </div>
      </div>

      <div className={`section ${tab === "profile" ? "active" : ""}`} id="profileSection">
        <div className="container">
          <ProfilePage />
        </div>
      </div>

      <div className={`section ${tab === "reports" ? "active" : ""}`} id="reportsSection">
        <div className="container">
          <FlagsReportsPage />
        </div>
      </div>

      {showAddProduct ? (
        <div className="modal-overlay active" id="addModal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add New Product</h2>
              <button className="modal-close" onClick={() => setShowAddProduct(false)}>✕</button>
            </div>
            <AddProductPage />
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowAddProduct(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [sessionVersion, setSessionVersion] = useState(0);
  const user = getUser();
  const validSession = hasSellerSession();

  if (!validSession || !user || user.role !== "seller") {
    return <AuthPage onAuthSuccess={() => setSessionVersion((v) => v + 1)} />;
  }

  return <SellerShell onLoggedOut={() => setSessionVersion((v) => v + 1)} key={sessionVersion} />;
}
