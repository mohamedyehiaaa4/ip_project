const express = require("express");
const { auth } = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");

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

function normalizeAddress(rawAddress = {}) {
  return {
    label: String(rawAddress.label || "Home").trim() || "Home",
    line1: String(rawAddress.line1 || "").trim(),
    city: String(rawAddress.city || "").trim(),
    country: String(rawAddress.country || "").trim(),
    postalCode: String(rawAddress.postalCode || "").trim(),
    isDefault: Boolean(rawAddress.isDefault)
  };
}

async function buildBuyerCartPayload(userId) {
  const user = await User.findById(userId).select("cart").lean();
  const cart = Array.isArray(user?.cart) ? user.cart : [];
  const productIds = cart.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const items = cart
    .map((item) => {
      const product = productMap.get(String(item.productId));
      if (!product) return null;

      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Number(product.price || 0);
      const lineTotal = unitPrice * quantity;

      return {
        productId: product._id,
        productName: product.name,
        category: product.category || "General",
        imageUrl: product.imageUrl || "",
        sellerId: product.sellerId,
        unitPrice,
        quantity,
        lineTotal,
        availableInventory: Number(product.inventory || 0),
        deliveryDays: Math.max(1, Number(product.deliveryDays || 1))
      };
    })
    .filter(Boolean);

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    items,
    subtotal,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
  };
}

router.get("/seller/me/profile", auth("seller"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name businessName email supportEmail phone addressLine city country balance");
    if (!user) return res.status(404).json({ message: "Seller not found" });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch profile", error: err.message });
  }
});

router.patch("/seller/me/profile", auth("seller"), async (req, res) => {
  try {
    const allowed = ["name", "businessName", "email", "supportEmail", "phone", "addressLine", "city", "country"];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[key] = typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
      }
    }

    if (update.email) {
      update.email = String(update.email).toLowerCase();
      const exists = await User.findOne({ email: update.email, _id: { $ne: req.user.id } });
      if (exists) return res.status(409).json({ message: "Email already used by another account" });
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select(
      "name businessName email supportEmail phone addressLine city country flags role"
    );
    if (!user) return res.status(404).json({ message: "Seller not found" });

    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update profile", error: err.message });
  }
});

router.get("/buyer/me/profile", auth("buyer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name email phone addressLine city country addresses");
    if (!user) return res.status(404).json({ message: "Buyer not found" });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch buyer profile", error: err.message });
  }
});

router.patch("/buyer/me/profile", auth("buyer"), async (req, res) => {
  try {
    const allowed = ["name", "email", "phone", "addressLine", "city", "country"];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[key] = typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
      }
    }

    if (req.body.addresses !== undefined) {
      if (!Array.isArray(req.body.addresses)) {
        return res.status(400).json({ message: "addresses must be an array" });
      }

      const normalized = req.body.addresses.map(normalizeAddress);
      if (normalized.some((address) => !address.line1 || !address.city || !address.country)) {
        return res.status(400).json({ message: "Each address must include line1, city and country" });
      }

      let defaultExists = normalized.some((address) => address.isDefault);
      if (!defaultExists && normalized.length) {
        normalized[0].isDefault = true;
        defaultExists = true;
      }

      if (defaultExists) {
        let defaultFound = false;
        update.addresses = normalized.map((address) => {
          if (address.isDefault && !defaultFound) {
            defaultFound = true;
            return address;
          }
          return { ...address, isDefault: false };
        });
      } else {
        update.addresses = normalized;
      }
    }

    if (update.email) {
      update.email = String(update.email).toLowerCase();
      const exists = await User.findOne({ email: update.email, _id: { $ne: req.user.id } });
      if (exists) return res.status(409).json({ message: "Email already used by another account" });
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select(
      "name email phone addressLine city country addresses role"
    );
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update buyer profile", error: err.message });
  }
});

router.post("/buyer/me/addresses", auth("buyer"), async (req, res) => {
  try {
    const address = normalizeAddress(req.body || {});
    if (!address.line1 || !address.city || !address.country) {
      return res.status(400).json({ message: "line1, city and country are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    if (!Array.isArray(user.addresses)) user.addresses = [];
    if (address.isDefault || !user.addresses.length) {
      user.addresses = user.addresses.map((item) => ({ ...item.toObject(), isDefault: false }));
      address.isDefault = true;
    }

    user.addresses.push(address);
    await user.save();

    return res.status(201).json(user.addresses);
  } catch (err) {
    return res.status(500).json({ message: "Failed to add address", error: err.message });
  }
});

router.delete("/buyer/me/addresses/:addressId", auth("buyer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    const existing = user.addresses.id(req.params.addressId);
    if (!existing) return res.status(404).json({ message: "Address not found" });

    const wasDefault = Boolean(existing.isDefault);
    existing.deleteOne();

    if (wasDefault && user.addresses.length) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.json(user.addresses);
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete address", error: err.message });
  }
});

router.get("/buyer/me/cart", auth("buyer"), async (req, res) => {
  try {
    const payload = await buildBuyerCartPayload(req.user.id);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch cart", error: err.message });
  }
});

router.post("/buyer/me/cart/items", auth("buyer"), async (req, res) => {
  try {
    const productId = req.body?.productId;
    const quantity = Math.max(1, Number(req.body?.quantity || 1));

    if (!productId) return res.status(400).json({ message: "productId is required" });

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    const found = user.cart.find((item) => String(item.productId) === String(productId));
    if (found) {
      found.quantity += quantity;
    } else {
      user.cart.push({ productId, quantity });
    }

    await user.save();
    const payload = await buildBuyerCartPayload(req.user.id);
    return res.status(201).json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to add item to cart", error: err.message });
  }
});

router.patch("/buyer/me/cart/items/:productId", auth("buyer"), async (req, res) => {
  try {
    const quantity = Number(req.body?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ message: "quantity must be a valid number >= 0" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    user.cart = user.cart.filter((item) => {
      if (String(item.productId) !== String(req.params.productId)) return true;
      if (quantity === 0) return false;
      item.quantity = Math.max(1, Math.floor(quantity));
      return true;
    });

    await user.save();
    const payload = await buildBuyerCartPayload(req.user.id);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update cart item", error: err.message });
  }
});

router.delete("/buyer/me/cart/items/:productId", auth("buyer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    user.cart = user.cart.filter((item) => String(item.productId) !== String(req.params.productId));
    await user.save();

    const payload = await buildBuyerCartPayload(req.user.id);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: "Failed to remove item from cart", error: err.message });
  }
});

router.delete("/buyer/me/cart", auth("buyer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Buyer not found" });

    user.cart = [];
    await user.save();
    return res.json({ items: [], subtotal: 0, itemCount: 0 });
  } catch (err) {
    return res.status(500).json({ message: "Failed to clear cart", error: err.message });
  }
});

router.get("/buyer/me/wishlist", auth("buyer"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("wishlist").lean();
    const wishlistIds = Array.isArray(user?.wishlist) ? user.wishlist : [];

    const products = await Product.find({ _id: { $in: wishlistIds }, isActive: true }).sort({ createdAt: -1 }).lean();
    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch wishlist", error: err.message });
  }
});

router.post("/buyer/me/wishlist/:productId", auth("buyer"), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.productId, isActive: true });
    if (!product) return res.status(404).json({ message: "Product not found" });

    await User.updateOne(
      { _id: req.user.id, wishlist: { $ne: req.params.productId } },
      { $push: { wishlist: req.params.productId } }
    );

    const user = await User.findById(req.user.id).select("wishlist").lean();
    return res.status(201).json({ wishlist: user?.wishlist || [] });
  } catch (err) {
    return res.status(500).json({ message: "Failed to add wishlist item", error: err.message });
  }
});

router.delete("/buyer/me/wishlist/:productId", auth("buyer"), async (req, res) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $pull: { wishlist: req.params.productId } });
    const user = await User.findById(req.user.id).select("wishlist").lean();
    return res.json({ wishlist: user?.wishlist || [] });
  } catch (err) {
    return res.status(500).json({ message: "Failed to remove wishlist item", error: err.message });
  }
});

router.post("/buyer/me/cart/checkout", auth("buyer"), async (req, res) => {
  try {
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const cardDetails = req.body?.cardDetails || null;

    if (paymentMethod === "Credit Card") {
      const cardError = validateCardDetails(cardDetails);
      if (cardError) return res.status(400).json({ message: cardError });
    }

    const user = await User.findById(req.user.id).select("cart");
    if (!user) return res.status(404).json({ message: "Buyer not found" });
    if (!Array.isArray(user.cart) || !user.cart.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const cartPayload = await buildBuyerCartPayload(req.user.id);
    if (!cartPayload.items.length) {
      user.cart = [];
      await user.save();
      return res.status(400).json({ message: "No valid products found in cart" });
    }

    const groupedBySeller = new Map();
    for (const item of cartPayload.items) {
      const sellerKey = String(item.sellerId);
      const existing = groupedBySeller.get(sellerKey) || [];
      existing.push(item);
      groupedBySeller.set(sellerKey, existing);
    }

    const createdOrders = [];
    for (const [sellerId, items] of groupedBySeller.entries()) {
      const orderItems = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.unitPrice
      }));

      let totalPrice = 0;
      let expectedDeliveryDays = 1;
      const stockUpdates = [];

      for (const item of items) {
        const stockResult = await Product.updateOne(
          {
            _id: item.productId,
            sellerId,
            isActive: true,
            inventory: { $gte: item.quantity }
          },
          { $inc: { inventory: -item.quantity, orders: item.quantity } }
        );

        if (!stockResult.modifiedCount) {
          if (stockUpdates.length) {
            await Product.bulkWrite(
              stockUpdates.map((u) => ({
                updateOne: {
                  filter: { _id: u.productId },
                  update: { $inc: { inventory: u.quantity, orders: -u.quantity } }
                }
              }))
            );
          }
          return res.status(400).json({ message: "One or more items are out of stock" });
        }

        stockUpdates.push({ productId: item.productId, quantity: item.quantity });
        totalPrice += item.unitPrice * item.quantity;
        expectedDeliveryDays = Math.max(expectedDeliveryDays, Number(item.deliveryDays || 1));
      }

      const isCreditCard = paymentMethod === "Credit Card";
      const orderData = {
        buyerId: req.user.id,
        sellerId,
        products: orderItems,
        status: "Placed",
        totalPrice,
        paymentMethod,
        paymentStatus: isCreditCard ? "Paid" : "Pending",
        expectedDeliveryDays,
        expectedDeliveryDate: addDays(new Date(), expectedDeliveryDays)
      };

      if (isCreditCard) {
        const rawNumber = cardDetails.cardNumber.replace(/\s/g, "");
        orderData.cardLast4 = rawNumber.slice(-4);
        orderData.cardHolderName = cardDetails.cardHolder.trim();
        orderData.cardExpiry = cardDetails.cardExpiry;
        await User.findByIdAndUpdate(sellerId, { $inc: { balance: totalPrice } });
      }

      const order = await Order.create(orderData);
      createdOrders.push(order);
    }

    user.cart = [];
    await user.save();

    return res.status(201).json({
      message: "Checkout successful",
      orders: createdOrders,
      orderCount: createdOrders.length
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to checkout cart", error: err.message });
  }
});

module.exports = router;