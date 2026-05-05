const express = require("express");
const Product = require("../models/Product");
const Comment = require("../models/Comment");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "..", "uploads", "products");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    return cb(null, true);
  }
});

function maybeUpload(req, res, next) {
  const type = req.headers["content-type"] || "";
  if (type.includes("multipart/form-data")) {
    return imageUpload.single("image")(req, res, next);
  }
  return next();
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();

    const filter = { isActive: true };
    if (category) filter.category = category;
    if (q) filter.name = { $regex: q, $options: "i" };

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    const sellerIds = [...new Set(products.map((product) => String(product.sellerId)))];
    const sellers = sellerIds.length ? await require("../models/User").find({ _id: { $in: sellerIds } }).select("name businessName email supportEmail phone city country").lean() : [];
    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));

    return res.json(
      products.map((product) => {
        const seller = sellerMap.get(String(product.sellerId));
        return {
          ...product,
          sellerName: seller?.name || "Seller",
          sellerBusinessName: seller?.businessName || "",
          sellerEmail: seller?.email || "",
          sellerSupportEmail: seller?.supportEmail || "",
          sellerPhone: seller?.phone || "",
          sellerCity: seller?.city || "",
          sellerCountry: seller?.country || ""
        };
      })
    );
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const categories = await Product.distinct("category", { isActive: true });
    return res.json(
      categories
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .map((name, i) => ({ id: i + 1, name }))
    );
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch categories", error: err.message });
  }
});

router.get("/seller/me/list", auth("seller"), async (req, res) => {
  try {
    const [products, sellerOrders] = await Promise.all([
      Product.find({ sellerId: req.user.id }).sort({ createdAt: -1 }).lean(),
      Order.find({ sellerId: req.user.id, status: { $ne: "Cancelled" } }).select("products").lean()
    ]);

    const soldByProduct = new Map();
    for (const order of sellerOrders) {
      for (const item of order.products || []) {
        const key = String(item.productId);
        soldByProduct.set(key, (soldByProduct.get(key) || 0) + Number(item.quantity || 0));
      }
    }

    const normalized = products.map((product) => {
      const soldFromOrders = soldByProduct.get(String(product._id)) || 0;
      const trackedOrders = Number(product.orders || 0);
      const stockDelta = Math.max(0, soldFromOrders - trackedOrders);

      return {
        ...product,
        orders: Math.max(trackedOrders, soldFromOrders),
        inventory: Math.max(0, Number(product.inventory || 0) - stockDelta)
      };
    });

    return res.json(normalized);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch seller products", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    const User = require("../models/User");
    const seller = await User.findById(product.sellerId).select("name businessName email supportEmail phone city country").lean();
    const comments = await Comment.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({
      product: {
        ...product,
        sellerName: seller?.name || "Seller",
        sellerBusinessName: seller?.businessName || "",
        sellerEmail: seller?.email || "",
        sellerSupportEmail: seller?.supportEmail || "",
        sellerPhone: seller?.phone || "",
        sellerCity: seller?.city || "",
        sellerCountry: seller?.country || ""
      },
      comments
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch product", error: err.message });
  }
});

router.post("/", auth("seller"), maybeUpload, async (req, res) => {
  try {
    const { name, description, price, category, deliveryDays, deliveryTime, imageUrl, discountPercentage, inventory } = req.body || {};
    if (!name || price === undefined || price === null || price === "") {
      return res.status(400).json({ message: "name and price are required" });
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "price must be a valid positive number" });
    }

    const parsedDeliveryDays = Math.max(
      1,
      Number(deliveryDays ?? String(deliveryTime || "").match(/\d+/)?.[0] ?? 3)
    );

    const uploadedImageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

    const product = await Product.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      price: parsedPrice,
      category: String(category || "General").trim(),
      deliveryDays: parsedDeliveryDays,
      discountPercentage: Math.max(0, Math.min(100, Number(discountPercentage || 0))),
      inventory: Math.max(0, Number(inventory || 0)),
      imageUrl: uploadedImageUrl || String(imageUrl || "").trim(),
      sellerId: req.user.id
    });

    return res.status(201).json(product);
  } catch (err) {
    return res.status(500).json({ message: "Failed to create product", error: err.message });
  }
});

router.put("/:id", auth("seller"), maybeUpload, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, sellerId: req.user.id });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const uploadedImageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

    const fields = [
      "name",
      "description",
      "price",
      "category",
      "deliveryDays",
      "imageUrl",
      "discountPercentage",
      "inventory",
      "isActive"
    ];

    if (req.body.deliveryTime !== undefined && req.body.deliveryDays === undefined) {
      req.body.deliveryDays = Number(String(req.body.deliveryTime || "").match(/\d+/)?.[0] || 3);
    }

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        if (["price", "discountPercentage", "inventory", "deliveryDays"].includes(field)) {
          product[field] = Number(req.body[field]);
        } else {
          product[field] = req.body[field];
        }
      }
    }

    if (uploadedImageUrl) {
      product.imageUrl = uploadedImageUrl;
    }

    await product.save();
    return res.json(product);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update product", error: err.message });
  }
});

router.delete("/:id", auth("seller"), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, sellerId: req.user.id }).select("_id");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const blockingOrder = await Order.findOne({
      sellerId: req.user.id,
      "products.productId": product._id,
      status: { $in: ["Placed", "Processing", "Preparing"] }
    }).select("_id status");

    if (blockingOrder) {
      return res.status(400).json({
        message: "Product cannot be deleted until all related orders are shipped"
      });
    }

    const result = await Product.deleteOne({ _id: req.params.id, sellerId: req.user.id });
    if (!result.deletedCount) return res.status(404).json({ message: "Product not found" });
    return res.json({ message: "Product deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
});

module.exports = router;
