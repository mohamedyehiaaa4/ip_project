const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, required: true }
  },
  { timestamps: true }
);

commentSchema.index({ productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Comment", commentSchema);
