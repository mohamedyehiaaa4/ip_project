const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "Home" },
    line1: { type: String, trim: true, required: true },
    city: { type: String, trim: true, required: true },
    country: { type: String, trim: true, required: true },
    postalCode: { type: String, trim: true, default: "" },
    isDefault: { type: Boolean, default: false }
  },
  { _id: true }
);

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["buyer", "seller"], required: true },
    flags: { type: Number, default: 0 },
    businessName: { type: String, trim: true },
    supportEmail: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    addressLine: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    addresses: { type: [addressSchema], default: [] },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    cart: { type: [cartItemSchema], default: [] },
    balance: { type: Number, default: 0 },
    sellerRating: { type: Number, default: 0, min: 0, max: 5 },
    sellerReviewCount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);