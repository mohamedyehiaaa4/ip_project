const express = require("express");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const SellerBuyerRating = require("../models/SellerBuyerRating");
const BuyerSellerRating = require("../models/BuyerSellerRating");
const { auth } = require("../middleware/auth");

const router = express.Router();
const PAYMENT_METHODS = ["Cash on Delivery", "Credit Card"];

function addDays(baseDate, days) {
  const dt = new Date(baseDate);
  dt.setDate(dt.getDate() + Number(days || 0));
  return dt;
}

function normalizePaymentMethod(value) {
  const candidate = String(value || "").trim();
  return PAYMENT_METHODS.includes(candidate) ? candidate : "Cash on Delivery";
}

function validateCardDetails(cardDetails) {
  if (!cardDetails) return "Card details are required for Credit Card payment";
  const { cardNumber, cardHolder, cardExpiry, cardCVV } = cardDetails;
  if (!cardNumber || !/^\d{16}$/.test(cardNumber.replace(/\s/g, "")))
    return "Card number must be 16 digits";
  if (!cardHolder || !cardHolder.trim())
    return "Card holder name is required";
  if (!cardExpiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry))
    return "Expiry must be in MM/YY format";
  if (!cardCVV || !/^\d{3,4}$/.test(cardCVV))
    return "CVV must be 3 or 4 digits";
  return null;
}

async function rollbackOrderStock(order) {
  const updates = (order.products || []).map((item) => ({
    updateOne: {
      filter: {
        _id: item.productId,
        sellerId: order.sellerId
      },
      update: {
        $inc: {
          inventory: Number(item.quantity || 0),
          orders: -Number(item.quantity || 0)
        }
      }
    }
  }));

  if (updates.length) {
    await Product.bulkWrite(updates);
  }
}

router.post("/", auth("buyer"), async (req, res) => {
  try {
    const { items, paymentMethod, cardDetails } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const resolvedMethod = normalizePaymentMethod(paymentMethod);
    if (resolvedMethod === "Credit Card") {
      const cardError = validateCardDetails(cardDetails);
      if (cardError) return res.status(400).json({ message: cardError });
    }

    const products = await Product.find({ _id: { $in: items.map((i) => i.productId) }, isActive: true });
    if (!products.length) return res.status(400).json({ message: "No valid products found" });

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const firstSeller = String(products[0].sellerId);

    const orderItems = [];
    let totalPrice = 0;
    let expectedDeliveryDays = 1;

    for (const rawItem of items) {
      const p = productMap.get(String(rawItem.productId));
      if (!p) continue;
      if (String(p.sellerId) !== firstSeller) {
        return res.status(400).json({ message: "Each order must contain products from one seller only" });
      }

      const quantity = Math.max(1, Number(rawItem.quantity || 1));
      orderItems.push({ productId: p._id, quantity, price: p.price });
      totalPrice += p.price * quantity;
      expectedDeliveryDays = Math.max(expectedDeliveryDays, Number(p.deliveryDays || 1));
    }

    if (!orderItems.length) {
      return res.status(400).json({ message: "No order items generated" });
    }

    const appliedStockUpdates = [];
    for (const item of orderItems) {
      const stockResult = await Product.updateOne(
        {
          _id: item.productId,
          sellerId: firstSeller,
          isActive: true,
          inventory: { $gte: item.quantity }
        },
        { $inc: { inventory: -item.quantity, orders: item.quantity } }
      );

      if (!stockResult.modifiedCount) {
        if (appliedStockUpdates.length) {
          await Product.bulkWrite(
            appliedStockUpdates.map((u) => ({
              updateOne: {
                filter: { _id: u.productId },
                update: { $inc: { inventory: u.quantity, orders: -u.quantity } }
              }
            }))
          );
        }
        return res.status(400).json({ message: "One or more items are out of stock" });
      }

      appliedStockUpdates.push({ productId: item.productId, quantity: item.quantity });
    }

    const isCreditCard = resolvedMethod === "Credit Card";
    const orderData = {
      buyerId: req.user.id,
      sellerId: firstSeller,
      products: orderItems,
      status: "Placed",
      totalPrice,
      paymentMethod: resolvedMethod,
      paymentStatus: isCreditCard ? "Paid" : "Pending",
      expectedDeliveryDays,
      expectedDeliveryDate: addDays(new Date(), expectedDeliveryDays)
    };

    if (isCreditCard) {
      const rawNumber = cardDetails.cardNumber.replace(/\s/g, "");
      orderData.cardLast4 = rawNumber.slice(-4);
      orderData.cardHolderName = cardDetails.cardHolder.trim();
      orderData.cardExpiry = cardDetails.cardExpiry;
      await User.findByIdAndUpdate(firstSeller, { $inc: { balance: totalPrice } });
    }

    const order = await Order.create(orderData);
    return res.status(201).json(order);
  } catch (err) {
    return res.status(500).json({ message: "Failed to place order", error: err.message });
  }
});

router.get("/buyer/me", auth("buyer"), async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user.id }).sort({ createdAt: -1 }).lean();

    const sellerIds = [...new Set(orders.map((order) => String(order.sellerId)))];
    const orderIds = orders.map((order) => order._id);
    const productIds = [
      ...new Set(orders.flatMap((order) => (order.products || []).map((item) => String(item.productId))))
    ];

    const [sellers, products, sellerRatings] = await Promise.all([
      User.find({ _id: { $in: sellerIds } }).select("name").lean(),
      Product.find({ _id: { $in: productIds } }).select("name imageUrl sellerId deliveryDays").lean(),
      BuyerSellerRating.find({ orderId: { $in: orderIds }, buyerId: req.user.id }).lean()
    ]);

    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller.name]));
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const ratingMap = new Map(sellerRatings.map((rating) => [String(rating.orderId), rating]));

    const payload = orders.map((order) => {
      const itemsDetailed = (order.products || []).map((item) => {
        const product = productMap.get(String(item.productId));
        return {
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          productName: product?.name || "Product",
          imageUrl: product?.imageUrl || "",
          sellerId: product?.sellerId || order.sellerId,
          sellerName: sellerMap.get(String(product?.sellerId || order.sellerId)) || "Seller",
          deliveryDays: Number(product?.deliveryDays || order.expectedDeliveryDays || 1)
        };
      });

      const orderRating = ratingMap.get(String(order._id));
      return {
        ...order,
        sellerName: sellerMap.get(String(order.sellerId)) || "Seller",
        productName: itemsDetailed[0]?.productName || `Order ${String(order._id).slice(-6)}`,
        itemsDetailed,
        sellerRating: orderRating
          ? {
              rating: Number(orderRating.rating || 0),
              comment: orderRating.comment || ""
            }
          : null
      };
    });

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch orders", error: err.message });
  }
});

router.delete("/buyer/:id", auth("buyer"), async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, buyerId: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "Cancelled") {
      return res.status(400).json({ message: "Only cancelled orders can be removed from history" });
    }

    await Order.deleteOne({ _id: order._id, buyerId: req.user.id });
    return res.json({ message: "Cancelled order removed" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to remove order", error: err.message });
  }
});

router.patch("/buyer/:id/cancel", auth("buyer"), async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, buyerId: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "Cancelled") {
      return res.json(order);
    }

    const cancellableStatuses = ["Placed", "Processing", "Preparing"];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ message: "Order can no longer be cancelled" });
    }

    await rollbackOrderStock(order);
    order.status = "Cancelled";
    await order.save();

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: "Failed to cancel order", error: err.message });
  }
});

router.get("/seller/me", auth("seller"), async (req, res) => {
  try {
    const orders = await Order.find({ sellerId: req.user.id }).sort({ createdAt: -1 }).lean();
    const buyerIds = [...new Set(orders.map((o) => String(o.buyerId)))];
    const orderIds = orders.map((o) => o._id);

    const [buyers, ratings] = await Promise.all([
      User.find({ _id: { $in: buyerIds } }).select("name").lean(),
      SellerBuyerRating.find({ orderId: { $in: orderIds }, sellerId: req.user.id }).lean()
    ]);

    const buyerMap = new Map(buyers.map((b) => [String(b._id), b.name]));
    const ratingMap = new Map(ratings.map((r) => [String(r.orderId), r]));

    const productIds = [...new Set(orders.flatMap((o) => (o.products || []).map((p) => String(p.productId))))];
    const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
    const productMap = new Map(products.map((p) => [String(p._id), p.name]));

    const payload = orders.map((order) => {
      const firstItem = order.products?.[0];
      const r = ratingMap.get(String(order._id));
      return {
        _id: order._id,
        id: String(order._id),
        buyerId: order.buyerId,
        buyer_id: order.buyerId,
        buyerName: buyerMap.get(String(order.buyerId)) || "Unknown",
        buyer_name: buyerMap.get(String(order.buyerId)) || "Unknown",
        product: firstItem ? productMap.get(String(firstItem.productId)) || "Unknown product" : "No product",
        status: order.status,
        totalPrice: order.totalPrice,
        total_amount: order.totalPrice,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        created_at: order.createdAt,
        buyer_rating: r ? r.rating : null,
        buyer_rating_comment: r ? r.comment : ""
      };
    });

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch seller orders", error: err.message });
  }
});

router.patch("/:id/status", auth("seller"), async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ["Placed", "Processing", "Preparing", "Shipping", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findOne({ _id: req.params.id, sellerId: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "Cancelled" && status !== "Cancelled") {
      return res.status(400).json({ message: "Cancelled orders cannot be reopened" });
    }

    if (status === "Cancelled" && order.status !== "Cancelled") {
      await rollbackOrderStock(order);
    }

    // Credit seller balance when COD order is delivered
    if (
      status === "Delivered" &&
      order.status !== "Delivered" &&
      order.paymentMethod === "Cash on Delivery"
    ) {
      await User.findByIdAndUpdate(order.sellerId, { $inc: { balance: order.totalPrice } });
      order.paymentStatus = "Paid";
    }

    order.status = status;
    await order.save();
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update order", error: err.message });
  }
});

router.post("/seller/ratings/buyer", auth("seller"), async (req, res) => {
  try {
    const { orderId, buyerId, rating, comment } = req.body || {};
    if (!orderId || !buyerId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "orderId, buyerId and rating (1-5) are required" });
    }

    const order = await Order.findOne({ _id: orderId, sellerId: req.user.id, buyerId });
    if (!order) return res.status(404).json({ message: "Order not found for this buyer" });

    const doc = await SellerBuyerRating.findOneAndUpdate(
      { orderId, sellerId: req.user.id, buyerId },
      { rating: Number(rating), comment: String(comment || "").trim() },
      { new: true, upsert: true }
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: "Failed to rate buyer", error: err.message });
  }
});

router.post("/buyer/ratings/seller", auth("buyer"), async (req, res) => {
  try {
    const { orderId, sellerId, rating, comment } = req.body || {};
    if (!orderId || !sellerId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "orderId, sellerId and rating (1-5) are required" });
    }

    const order = await Order.findOne({ _id: orderId, buyerId: req.user.id, sellerId });
    if (!order) return res.status(404).json({ message: "Order not found for this seller" });

    const doc = await BuyerSellerRating.findOneAndUpdate(
      { orderId, sellerId, buyerId: req.user.id },
      { rating: Number(rating), comment: String(comment || "").trim() },
      { new: true, upsert: true }
    );

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: "Failed to rate seller", error: err.message });
  }
});

module.exports = router;