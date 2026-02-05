
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const AchievementModel = require("../model/AchievementSchema");

const router = express.Router();

// 🔹 Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save to uploads folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// ✅ Save or Update Achievement (Preserve existing images)
router.post("/", upload.array("achievements", 10), async (req, res) => {
  try {
    const { name, description } = req.body;

    // Find existing package
    let existingPackage = await AchievementModel.findOne();

    const newImages = req.files.map((file) => ({
      imageUrl: `/uploads/${file.filename}`,
    }));

    if (existingPackage) {
      // Update existing package
      existingPackage.name = name;
      existingPackage.description = description ? JSON.parse(description) : [];
      existingPackage.achievements = [...existingPackage.achievements, ...newImages];
      await existingPackage.save();
      res.status(200).json(existingPackage);
    } else {
      // Create new package
      const newPackage = new AchievementModel({
        name,
        description: description ? JSON.parse(description) : [],
        achievements: newImages,
      });
      await newPackage.save();
      res.status(201).json(newPackage);
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// ✅ Get The Single Package
router.get("/", async (req, res) => {
  try {
    const package = await AchievementModel.findOne(); // Get the only one
    res.json(package || null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Delete The Single Package
router.delete("/", async (req, res) => {
  try {
    const package = await AchievementModel.findOne();
    if (package) {
      // Delete all associated image files
      for (const achievement of package.achievements) {
        const filePath = path.join(__dirname, "..", achievement.imageUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      await AchievementModel.deleteMany({});
      res.json({ message: "Package deleted successfully" });
    } else {
      res.json({ message: "No package found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Delete a Specific Image
router.delete("/image/:imageId", async (req, res) => {
  try {
    const { imageId } = req.params;
    const package = await AchievementModel.findOne();

    if (!package) {
      return res.status(404).json({ message: "No package found" });
    }

    const imageToDelete = package.achievements.find(
      (img) => img._id.toString() === imageId
    );

    if (!imageToDelete) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Delete the image file from the server
    const filePath = path.join(__dirname, "..", imageToDelete.imageUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove the image from the package
    package.achievements = package.achievements.filter(
      (img) => img._id.toString() !== imageId
    );
    await package.save();

    res.json({ message: "Image deleted successfully", package });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
