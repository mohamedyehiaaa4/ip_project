import { useEffect, useState } from "react";
import { api, saveAuth, getToken, getUser } from "../api";

const emptyProfile = {
  name: "",
  businessName: "",
  email: "",
  supportEmail: "",
  phone: "",
  addressLine: "",
  city: "",
  country: ""
};

export default function ProfilePage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.myProfile()
      .then((data) => setProfile({ ...emptyProfile, ...data }))
      .catch((err) => setMessage(err.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    try {
      const updated = await api.updateProfile(profile);
      const session = getUser() || {};
      saveAuth(getToken(), {
        ...session,
        ...updated,
        id: updated._id || session.id
      });
      setMessage("Profile updated successfully");
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="profile-section">
      <div className="profile-header">
        <h2>Seller Profile</h2>
        <p>Keep your store and contact details up to date</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <div className="form-group">
          <label>Business Name *</label>
          <input placeholder="Business Name" value={profile.businessName} onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))} required />
        </div>
        <div className="form-group">
          <label>Owner Name *</label>
          <input placeholder="Owner Name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className="form-group">
          <label>Email *</label>
          <input type="email" placeholder="Email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} required />
        </div>
        <div className="form-group">
          <label>Support Email</label>
          <input type="email" placeholder="Support Email" value={profile.supportEmail} onChange={(e) => setProfile((p) => ({ ...p, supportEmail: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input placeholder="Phone" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>City</label>
          <input placeholder="City" value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Country</label>
          <input placeholder="Country" value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))} />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Address</label>
          <textarea placeholder="Address" value={profile.addressLine} onChange={(e) => setProfile((p) => ({ ...p, addressLine: e.target.value }))} />
        </div>
        <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
          <button type="submit" className="btn-save">Save Changes</button>
        </div>
      </form>
      {message ? <p className="profile-message">{message}</p> : null}
    </div>
  );
}
