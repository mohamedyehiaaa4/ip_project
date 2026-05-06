const express = require("express");
const mongoose = require("mongoose");
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

function getDiscountedPrice(price, discountPercentage) {
  const basePrice = Math.max(0, Number(price || 0));
  const discount = Math.max(0, Math.min(100, Number(discountPercentage || 0)));
  return basePrice * (1 - discount / 100);
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

function snapshotAddress(address = {}) {
  return {
    label: String(address.label || "Delivery Address").trim() || "Delivery Address",
    line1: String(address.line1 || address.addressLine || "").trim(),
    city: String(address.city || "").trim(),
    country: String(address.country || "").trim(),
    postalCode: String(address.postalCode || "").trim()
  };
}

function hasAddressDetails(address = {}) {
  return Boolean(
    address &&
    [address.line1, address.addressLine, address.city, address.country, address.postalCode].some((value) => String(value || "").trim())
  );
}

function resolveDeliveryAddress(order = {}, buyer = {}) {
  if (hasAddressDetails(order.deliveryAddress)) {
    return snapshotAddress(order.deliveryAddress);
  }

  const savedAddresses = Array.isArray(buyer.addresses) ? buyer.addresses : [];
  const fallbackAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
  if (hasAddressDetails(fallbackAddress)) {
    return snapshotAddress(fallbackAddress);
  }

  if (hasAddressDetails(buyer)) {
    return snapshotAddress({
      label: "Buyer Profile Address",
      addressLine: buyer.addressLine,
      city: buyer.city,
      country: buyer.country
    });
  }

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
          inventory: Number(item.quantity || 0)
        }
      }
    }
  }));

  if (updates.length) {
    await Product.bulkWrite(updates);
  }
}

async function refreshSellerRatingSummary(sellerId) {
  const stats = await BuyerSellerRating.aggregate([
    { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
    {
      $group: {
        _id: "$sellerId",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    sellerRating: Number(stats[0]?.averageRating || 0),
    sellerReviewCount: Number(stats[0]?.reviewCount || 0)
  };

  await User.findByIdAndUpdate(sellerId, { $set: summary });
  return summary;
}

async function recomputeSellerDeliveredProductSales(sellerId) {
  const [sellerProducts, deliveredOrders] = await Promise.all([
    Product.find({ sellerId }).select("_id").lean(),
    Order.find({ sellerId, status: "Delivered" }).select("products").lean()
  ]);

  const soldByProduct = new Map();
  for (const order of deliveredOrders) {
    for (const item of order.products || []) {
      const key = String(item.productId);
      soldByProduct.set(key, (soldByProduct.get(key) || 0) + Number(item.quantity || 0));
    }
  }

  const updates = sellerProducts.map((product) => ({
    updateOne: {
      filter: { _id: product._id, sellerId },
      update: { $set: { orders: soldByProduct.get(String(product._id)) || 0 } }
    }
  }));

  if (updates.length) {
    await Product.bulkWrite(updates);
  }
}

router.post("/", auth("buyer"), async (req, res) => {
  try {
    const { items, paymentMethod, cardDetails, deliveryAddressId, deliveryAddress: requestDeliveryAddress } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const resolvedMethod = normalizePaymentMethod(paymentMethod);
    if (resolvedMethod === "Credit Card") {
      const cardError = validateCardDetails(cardDetails);
      if (cardError) return res.status(400).json({ message: cardError });
    }

    const buyer = await User.findById(req.user.id).select("addresses");
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    const addresses = Array.isArray(buyer.addresses) ? buyer.addresses : [];
    if (!addresses.length && !hasAddressDetails(requestDeliveryAddress)) {
      return res.status(400).json({ message: "Please add at least one delivery address before placing an order" });
    }

    const defaultAddress = addresses.find((address) => address.isDefault) || addresses[0];
    const selectedAddress = deliveryAddressId
      ? addresses.find((address) => String(address._id) === String(deliveryAddressId))
      : defaultAddress;

    const addressToSnapshot = hasAddressDetails(requestDeliveryAddress)
      ? requestDeliveryAddress
      : selectedAddress || defaultAddress || null;

    if (!addressToSnapshot) {
      return res.status(400).json({ message: "Please select a valid delivery address" });
    }

    const deliveryAddress = snapshotAddress(addressToSnapshot);
    if (!hasAddressDetails(deliveryAddress)) {
      return res.status(400).json({ message: "Please provide a complete delivery address" });
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
      const unitPrice = getDiscountedPrice(p.price, p.discountPercentage);
      orderItems.push({ productId: p._id, quantity, price: unitPrice });
      totalPrice += unitPrice * quantity;
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
        { $inc: { inventory: -item.quantity } }
      );

      if (!stockResult.modifiedCount) {
        if (appliedStockUpdates.length) {
          await Product.bulkWrite(
            appliedStockUpdates.map((u) => ({
              updateOne: {
                filter: { _id: u.productId },
                update: { $inc: { inventory: u.quantity } }
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
      expectedDeliveryDate: addDays(new Date(), expectedDeliveryDays),
      deliveryAddress
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

router.get("/seller/rating", auth("seller"), async (req, res) => {
  try {
    const stats = await BuyerSellerRating.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: "$sellerId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    if (stats.length) {
      const summary = await refreshSellerRatingSummary(req.user.id);
      return res.json({
        rating: summary.sellerRating,
        reviewCount: summary.sellerReviewCount
      });
    }

    const seller = await User.findById(req.user.id).select("sellerRating sellerReviewCount").lean();
    return res.json({
      rating: Number(seller?.sellerRating || 0),
      reviewCount: Number(seller?.sellerReviewCount || 0)
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch seller rating", error: err.message });
  }
});

router.get("/seller/stats", auth("seller"), async (req, res) => {
  try {
    const deliveredOrders = await Order.find({ sellerId: req.user.id, status: "Delivered" })
      .select("products")
      .lean();

    const productsSold = deliveredOrders.reduce(
      (sum, order) => sum + (order.products || []).reduce(
        (itemSum, item) => itemSum + Number(item.quantity || 0),
        0
      ),
      0
    );

    return res.json({ productsSold });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch seller stats", error: err.message });
  }
});

router.get("/seller/me", auth("seller"), async (req, res) => {
  try {
    const orders = await Order.find({ sellerId: req.user.id }).sort({ createdAt: -1 }).lean();
    const buyerIds = [...new Set(orders.map((o) => String(o.buyerId)))];
    const orderIds = orders.map((o) => o._id);

    const [buyers, ratings] = await Promise.all([
      User.find({ _id: { $in: buyerIds } }).select("name addresses addressLine city country").lean(),
      SellerBuyerRating.find({ orderId: { $in: orderIds }, sellerId: req.user.id }).lean()
    ]);

    const buyerMap = new Map(buyers.map((b) => [String(b._id), b]));
    const ratingMap = new Map(ratings.map((r) => [String(r.orderId), r]));

    const productIds = [...new Set(orders.flatMap((o) => (o.products || []).map((p) => String(p.productId))))];
    const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
    const productMap = new Map(products.map((p) => [String(p._id), p.name]));

    const payload = orders.map((order) => {
      const firstItem = order.products?.[0];
      const r = ratingMap.get(String(order._id));
      const buyer = buyerMap.get(String(order.buyerId));
      const buyerName = buyer?.name || "Unknown";
      return {
        _id: order._id,
        id: String(order._id),
        buyerId: order.buyerId,
        buyer_id: order.buyerId,
        buyerName,
        buyer_name: buyerName,
        product: firstItem ? productMap.get(String(firstItem.productId)) || "Unknown product" : "No product",
        products: (order.products || []).map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          productName: productMap.get(String(item.productId)) || "Unknown product"
        })),
        status: order.status,
        totalPrice: order.totalPrice,
        total_amount: order.totalPrice,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveryAddress: resolveDeliveryAddress(order, buyer),
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

    const previousStatus = order.status;

    if (status === "Cancelled" && previousStatus !== "Cancelled") {
      await rollbackOrderStock(order);
    }

    const shouldCreditCodBalance =
      status === "Delivered" &&
      previousStatus !== "Delivered" &&
      order.paymentMethod === "Cash on Delivery";

    order.status = status;
    if (shouldCreditCodBalance) {
      order.paymentStatus = "Paid";
    }

    // Older orders may be missing fields that are now required on order items.
    // Validate only the status/payment fields changed here so sellers can still
    // move those legacy orders to Delivered.
    await order.save({ validateModifiedOnly: true });

    if (shouldCreditCodBalance) {
      await User.findByIdAndUpdate(order.sellerId, { $inc: { balance: Number(order.totalPrice || 0) } });
    }

    if (status === "Delivered" || previousStatus === "Delivered") {
      await recomputeSellerDeliveredProductSales(order.sellerId);
    }

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update order" });
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

    await refreshSellerRatingSummary(sellerId);

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: "Failed to rate seller", error: err.message });
  }
});

module.exports = router;