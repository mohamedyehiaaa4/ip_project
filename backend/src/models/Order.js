const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: { type: [orderItemSchema], required: true },
    status: {
      type: String,
      enum: ["Placed", "Processing", "Preparing", "Shipping", "Delivered", "Cancelled"],
      default: "Placed"
    },
    totalPrice: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["Cash on Delivery", "Credit Card"],
      default: "Cash on Delivery"
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending"
    },
    cardLast4: { type: String, default: null },
    cardHolderName: { type: String, default: null },
    cardExpiry: { type: String, default: null },
    expectedDeliveryDays: {
      type: Number,
      min: 1,
      default: 3
    },
    expectedDeliveryDate: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);