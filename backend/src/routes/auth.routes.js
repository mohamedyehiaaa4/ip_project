const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const User = require("../models/User");
const { validateEmail, validatePassword } = require("../middleware/auth");

const router = express.Router();

let legacyPool = null;

function getLegacyPool() {
  const mysqlHost = process.env.MYSQL_HOST || process.env.DB_HOST;
  const mysqlUser = process.env.MYSQL_USER || process.env.DB_USER;
  const mysqlPassword = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD;
  const mysqlDatabase = process.env.MYSQL_DATABASE || process.env.DB_NAME || "marketplace";

  if (!mysqlHost || !mysqlUser) {
    return null;
  }

  if (!legacyPool) {
    legacyPool = mysql.createPool({
      host: mysqlHost,
      port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
      user: mysqlUser,
      password: mysqlPassword || "",
      database: mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 5
    });
  }

  return legacyPool;
}

async function upsertLegacyUserIntoMongo(legacyUser, role) {
  const payload = {
    name: legacyUser.name,
    email: String(legacyUser.email).toLowerCase().trim(),
    password: legacyUser.password_hash,
    role,
    businessName: role === "seller" ? String(legacyUser.business_name || "").trim() : "",
    supportEmail: legacyUser.support_email || "",
    phone: legacyUser.phone || "",
    addressLine: legacyUser.address_line || "",
    city: legacyUser.city || "",
    country: legacyUser.country || ""
  };

  await User.updateOne(
    { email: payload.email },
    { $setOnInsert: payload },
    { upsert: true }
  );

  return payload;
}

async function findLegacyAccount(email, password) {
  const pool = getLegacyPool();
  if (!pool) return null;

  const cleanEmail = String(email).toLowerCase().trim();
  const checks = [
    {
      role: "seller",
      query: "SELECT id, owner_name AS name, business_name, email, password_hash, support_email, phone, address_line, city, country FROM sellers WHERE email = ? LIMIT 1"
    },
    {
      role: "buyer",
      query: "SELECT id, full_name AS name, email, password_hash, phone, address_line, city, country FROM buyers WHERE email = ? LIMIT 1"
    }
  ];

  for (const item of checks) {
    const [rows] = await pool.query(item.query, [cleanEmail]);
    if (!rows.length) continue;

    const legacyUser = rows[0];
    const ok = await bcrypt.compare(password, legacyUser.password_hash);
    if (!ok) continue;

    await upsertLegacyUserIntoMongo(legacyUser, item.role);

    return {
      id: legacyUser.id,
      name: legacyUser.name,
      email: cleanEmail,
      role: item.role,
      flags: 0,
      businessName: item.role === "seller" ? legacyUser.business_name || "" : "",
      supportEmail: legacyUser.support_email || "",
      phone: legacyUser.phone || "",
      addressLine: legacyUser.address_line || "",
      city: legacyUser.city || "",
      country: legacyUser.country || ""
    };
  }

  return null;
}

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, businessName } = req.body || {};

    if (!name || !email || !password || !["buyer", "seller"].includes(role)) {
      return res.status(400).json({ message: "name, email, password, role are required" });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate password requirements
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ message: passwordErrors.join(", "), errors: passwordErrors });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: hash,
      role,
      businessName: role === "seller" ? String(businessName || "").trim() : ""
    });

    const token = createToken(user);
    return res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        flags: user.flags,
        businessName: user.businessName,
        supportEmail: user.supportEmail,
        phone: user.phone,
        addressLine: user.addressLine,
        city: user.city,
        country: user.country
      }
    });
  } catch (err) {
    return res.status(500).json({ message: "Register failed", error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    let authUser = user;

    if (authUser) {
      const ok = await bcrypt.compare(password, authUser.password);
      if (!ok) {
        authUser = null;
      }
    }

    if (!authUser) {
      authUser = await findLegacyAccount(email, password);
    }

    if (!authUser) return res.status(401).json({ message: "Invalid credentials" });

    const token = createToken(authUser);
    return res.json({
      token,
      user: {
        id: authUser._id || authUser.id,
        name: authUser.name,
        email: authUser.email,
        role: authUser.role,
        flags: authUser.flags || 0,
        businessName: authUser.businessName || "",
        supportEmail: authUser.supportEmail || "",
        phone: authUser.phone || "",
        addressLine: authUser.addressLine || "",
        city: authUser.city || "",
        country: authUser.country || ""
      }
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed", error: err.message });
  }
});

module.exports = router;
