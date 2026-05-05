import { useEffect, useState } from "react";
import { api, getUser } from "../api";

const STATUS_COLORS = {
  Open: { background: "#fee2e2", color: "#b91c1c" },
  Resolved: { background: "#dcfce7", color: "#15803d" }
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function FlagsReportsPage() {
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [directionFilter, setDirectionFilter] = useState("All");
  const [message, setMessage] = useState({ text: "", type: "success" });
  const currentUser = getUser();
  const currentUserId = String(currentUser?.id || currentUser?._id || "");

  function showMessage(text, type = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "success" }), 3000);
  }

  async function loadReports() {
    const allReports = await api.reports();
    setReports(Array.isArray(allReports) ? allReports : []);
  }

  useEffect(() => {
    loadReports().catch((err) => showMessage(err.message, "error"));
  }, []);

  const visibleReports = reports.filter((report) => {
    const statusOk = statusFilter === "All" || report.status === statusFilter;
    const isFiled = String(report.reportedBy?._id || report.reportedBy?.id || report.reportedBy) === currentUserId;
    const directionOk =
      directionFilter === "All" ||
      (directionFilter === "Filed by me" && isFiled) ||
      (directionFilter === "Against me" && !isFiled);
    return statusOk && directionOk;
  });

  async function resolveFlag(reportId) {
    try {
      await api.deleteFlag(reportId);
      setReports((prev) => prev.filter((r) => String(r._id) !== String(reportId)));
      showMessage("Flag resolved and removed successfully");
    } catch (err) {
      showMessage(err.message || "Failed to resolve flag", "error");
    }
  }

  const counts = {
    All: reports.length,
    Open: reports.filter((r) => r.status === "Open").length,
    Resolved: reports.filter((r) => r.status === "Resolved").length
  };

  return (
    <>
      <div className="header">
        <div className="header-title">
          <h1>Flags / Reports</h1>
          <p>Manage delivery disputes and buyer reports</p>
        </div>
      </div>

      {message.text ? (
        <div style={{
          marginBottom: 16,
          background: message.type === "error" ? "#fee2e2" : "#dcfce7",
          color: message.type === "error" ? "#b91c1c" : "#15803d",
          padding: "10px 14px",
          borderRadius: 8,
          fontWeight: 500
        }}>
          {message.text}
        </div>
      ) : null}

      {/* Status filter */}
      <div className="filter-tabs" style={{ marginBottom: 10 }}>
        {["All", "Open", "Resolved"].map((s) => (
          <button
            key={s}
            className={`filter-btn ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Direction filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["All", "Filed by me", "Against me"].map((d) => (
          <button
            key={d}
            onClick={() => setDirectionFilter(d)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: directionFilter === d ? "#1e3a5f" : "white",
              color: directionFilter === d ? "white" : "#374151",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="reports-list">
        {visibleReports.length ? visibleReports.map((report) => {
          const isFiled = String(report.reportedBy?._id || report.reportedBy?.id || report.reportedBy) === currentUserId;
          const statusStyle = STATUS_COLORS[report.status] || STATUS_COLORS.Open;

          return (
            <div className="report-card" key={report._id} style={{ borderLeft: `4px solid ${statusStyle.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, color: "#f1f5f9" }}>{report.reason}</h3>
                  <span style={{
                    display: "inline-block",
                    marginTop: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: isFiled ? "#dbeafe" : "#fce7f3",
                    color: isFiled ? "#1d4ed8" : "#be185d"
                  }}>
                    {isFiled ? "📤 Filed by you" : "📥 Filed against you"}
                  </span>
                </div>
                <span style={{
                  padding: "4px 12px",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  ...statusStyle
                }}>
                  {report.status}
                </span>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#cbd5e1" }}>
                <div><strong>Reported user:</strong> {report.reportedUserId?.name || "Unknown"} ({report.reportedUserId?.role || "—"})</div>
                <div><strong>Reported by:</strong> {report.reportedBy?.name || "Unknown"} ({report.reportedBy?.role || "—"})</div>
                {report.orderId && <div><strong>Order:</strong> #{String(report.orderId).slice(-6)}</div>}
                <div><strong>Submitted:</strong> {formatDate(report.createdAt)}</div>
              </div>

              {report.details && (
                <p style={{ marginTop: 10, padding: "8px 12px", background: "rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 13, color: "#e2e8f0" }}>
                  "{report.details}"
                </p>
              )}

              {/* Only show Resolved button for flags filed by this seller */}
              {isFiled && report.status === "Open" && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => resolveFlag(report._id)}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 8,
                      border: "none",
                      background: "#dcfce7",
                      color: "#15803d",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13
                    }}
                  >
                    ✅ Mark as Resolved
                  </button>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="empty-message">
            <div className="empty-message-icon">📭</div>
            <p>No reports found</p>
          </div>
        )}
      </div>
    </>
  );
}
