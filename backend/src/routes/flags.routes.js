const express = require("express");
const mongoose = require("mongoose");
const Flag = require("../models/Flag");
const User = require("../models/User");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

const router = express.Router();
const BUYER_LATE_DELIVERY_REASON = "Late Delivery";
const SELLER_NOT_RECEIVED_REASON = "Package Not Received";

// POST /flags — create a flag (buyer or seller)
router.post("/", auth(), async (req, res) => {
  try {
    const { reportedUserId, reason, orderId, details } = req.body || {};
    if (!reportedUserId || !reason) {
      return res.status(400).json({ message: "reportedUserId and reason are required" });
    }

    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) return res.status(404).json({ message: "Reported user not found" });

    const normalizedReason = String(reason).trim();
    if ([BUYER_LATE_DELIVERY_REASON, SELLER_NOT_RECEIVED_REASON].includes(normalizedReason) && !orderId) {
      return res.status(400).json({ message: "orderId is required for this report reason" });
    }

    // Prevent duplicate flags for the same order
    if (orderId) {
      const existing = await Flag.findOne({
        reportedBy: req.user.id,
        reportedUserId,
        orderId,
        reason: normalizedReason
      });
      if (existing) {
        return res.status(409).json({ message: "You have already submitted this flag for this order" });
      }
    }

    if (normalizedReason === BUYER_LATE_DELIVERY_REASON) {
      if (req.user.role !== "buyer") {
        return res.status(403).json({ message: "Only buyers can submit late delivery reports" });
      }
      const order = await Order.findOne({ _id: orderId, buyerId: req.user.id, sellerId: reportedUserId }).lean();
      if (!order) return res.status(404).json({ message: "Order not found for this seller" });
      if (order.status === "Cancelled") {
        return res.status(400).json({ message: "Cannot flag a cancelled order" });
      }
    }

    if (normalizedReason === SELLER_NOT_RECEIVED_REASON) {
      if (req.user.role !== "seller") {
        return res.status(403).json({ message: "Only sellers can submit package not received reports" });
      }
      const order = await Order.findOne({ _id: orderId, sellerId: req.user.id, buyerId: reportedUserId }).lean();
      if (!order) return res.status(404).json({ message: "Order not found for this buyer" });
      if (!["Shipping", "Delivered"].includes(order.status)) {
        return res.status(400).json({ message: "Order must be in Shipping or Delivered status before flagging non-receipt" });
      }
    }

    const flag = await Flag.create({
      reportedUserId,
      reportedBy: req.user.id,
      reason: normalizedReason,
      details: String(details || "").trim(),
      orderId: orderId || null,
      status: "Open"
    });

    reportedUser.flags += 1;
    await reportedUser.save();

    return res.status(201).json(flag);
  } catch (err) {
    return res.status(500).json({ message: "Failed to create flag", error: err.message });
  }
});

// GET /flags/seller/reports — seller sees only flags that involve them
router.get("/seller/reports", auth("seller"), async (req, res) => {
  try {
    const filter = {
      $or: [
        { reportedBy: req.user.id },
        { reportedUserId: req.user.id }
      ]
    };

    const reports = await Flag.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("reportedUserId", "name email role")
      .populate("reportedBy", "name email role");

    return res.json(reports);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch reports", error: err.message });
  }
});

// GET /flags/buyer/my-flags — buyer sees flags they submitted + flags filed against them
router.get("/buyer/my-flags", auth("buyer"), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const flags = await Flag.find({
      $or: [
        { reportedBy: userId },
        { reportedUserId: userId }
      ]
    })
      .sort({ createdAt: -1 })
      .populate("reportedUserId", "name email role")
      .populate("reportedBy", "name email role");

    return res.json(flags);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch flags", error: err.message });
  }
});

// DELETE /flags/:id — resolve (remove) a flag, only by the person who filed it
router.delete("/:id", auth(), async (req, res) => {
  try {
    const flag = await Flag.findById(req.params.id);
    if (!flag) return res.status(404).json({ message: "Flag not found" });

    const flaggedBy = String(flag.reportedBy?._id || flag.reportedBy);
    const requesterId = String(req.user.id || req.user._id);
    if (flaggedBy !== requesterId) {
      return res.status(403).json({ message: "You can only resolve flags that you submitted" });
    }

    // Decrement the reported user's flag count
    await User.findByIdAndUpdate(flag.reportedUserId, { $inc: { flags: -1 } });
    await Flag.deleteOne({ _id: flag._id });

    return res.json({ message: "Flag resolved and removed" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to resolve flag", error: err.message });
  }
});

module.exports = router;
