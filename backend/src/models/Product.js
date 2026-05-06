const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, default: "General", trim: true },
    deliveryDays: { type: Number, default: 3, min: 1 },
    ratings: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    inventory: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
