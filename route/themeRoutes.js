const express = require("express");
const router = express.Router();
const Theme = require("../model/Theme");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const jwt = require("jsonwebtoken");

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.cookies.token || req.cookies.user_token || req.cookies.admin_token; // Check both token and admin_token
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,

});

// Get all themes (protected)
router.get("/", async (req, res) => {
  try {
    const themes = await Theme.find();
    res.json(themes);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get single theme (protected)
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const item = await Theme.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Theme not found" });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: "Invalid ID" });
  }
});

// Create theme (protected)
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { name, link, isActive } = req.body;
    const themeData = {
      name: name.trim(),
      link: link ? link.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
    };
    if (req.file) {
      themeData.imageUrl = `/uploads/${req.file.filename}`;
    }
    const theme = new Theme(themeData);
    await theme.save();
    res.status(201).json({ message: "Theme created", theme });
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to create theme" });
  }
});

// Update theme (protected)
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { name, link, isActive } = req.body;
    const item = await Theme.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Theme not found" });

    if (typeof name !== "undefined") item.name = name.trim();
    if (typeof link !== "undefined") item.link = link.trim();
    if (typeof isActive !== "undefined") item.isActive = isActive;

    if (req.file) {
      if (item.imageUrl && item.imageUrl.startsWith("/uploads/")) {
        const oldPath = path.join(__dirname, "..", item.imageUrl);
        await fs.unlink(oldPath).catch(() => {});
      }
      item.imageUrl = `/uploads/${req.file.filename}`;
    }

    await item.save();
    res.json({ message: "Theme updated", theme: item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message || "Failed to update theme" });
  }
});

// Delete theme (protected)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const item = await Theme.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Theme not found" });

    if (item.imageUrl && item.imageUrl.startsWith("/uploads/")) {
      const oldPath = path.join(__dirname, "..", item.imageUrl);
      await fs.unlink(oldPath).catch(() => {});
    }

    res.json({ message: "Theme deleted" });
  } catch (err) {
    res.status(400).json({ message: "Invalid ID" });
  }
});

module.exports = router;