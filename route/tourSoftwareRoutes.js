const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const TourSoftware = require("../model/TourSoftwareModel");

// ===================== Multer Setup =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Upload folder
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "_" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

// ===================== ROUTES =====================

// ✅ Create new software entry with logo and headerLogo upload
router.post("/", upload.fields([{ name: "logo" }, { name: "headerLogo" }]), async (req, res) => {
  try {
    const { softwareName, description, companyName, year, features, rating, tripadviserlink, tripadvisorRating,
      tripadvisorReviews, reviews, g2ReviewLink } = req.body; // New field
    const logo = req.files && req.files.logo ? "/uploads/" + req.files.logo[0].filename : null;
    const headerLogo = req.files && req.files.headerLogo ? "/uploads/" + req.files.headerLogo[0].filename : null;

    const newSoftware = new TourSoftware({
      softwareName,
      description,
      companyName,
      year,
      tripadviserlink,
      // ⭐ ADD HERE
      tripadvisorRating: tripadvisorRating ? parseFloat(tripadvisorRating) : 0,
      tripadvisorReviews: tripadvisorReviews ? parseInt(tripadvisorReviews) : 0,

      logo,
      headerLogo,
      g2ReviewLink, // New field
      features: features ? JSON.parse(features) : [],
      rating: rating ? parseFloat(rating) : 0,
      reviews: reviews ? parseInt(reviews) : 0,
    });

    const saved = await newSoftware.save();
    console.log(saved);

    res.status(201).json(saved);
  } catch (err) {
    console.error("Error creating software:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all software entries
router.get("/", async (req, res) => {
  try {
    const softwares = await TourSoftware.find().sort({ createdAt: -1 });
    res.status(200).json(softwares);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get software by ID
router.get("/:id", async (req, res) => {
  try {
    const software = await TourSoftware.findById(req.params.id);
    if (!software) return res.status(404).json({ message: "Not found" });
    res.status(200).json(software);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update software (logo and headerLogo optional)
router.put("/:id", upload.fields([{ name: "logo" }, { name: "headerLogo" }]), async (req, res) => {
  try {
    const { softwareName, description, companyName, year, tripadviserlink, features, rating, reviews, g2ReviewLink, tripadvisorRating,
      tripadvisorReviews } = req.body; // New field
    const updatedData = {
      softwareName,
      description,
      companyName,
      year,
      tripadviserlink,
      g2ReviewLink, // New field
      tripadvisorRating: tripadvisorRating ? parseFloat(tripadvisorRating) : 0,
      tripadvisorReviews: tripadvisorReviews ? parseInt(tripadvisorReviews) : 0,
      features: features ? JSON.parse(features) : [],
      rating: rating ? parseFloat(rating) : 0,
      reviews: reviews ? parseInt(reviews) : 0,
    };

    if (req.files && req.files.logo) {
      updatedData.logo = "/uploads/" + req.files.logo[0].filename;
    }
    if (req.files && req.files.headerLogo) {
      updatedData.headerLogo = "/uploads/" + req.files.headerLogo[0].filename;
    }

    const updated = await TourSoftware.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );

    console.log(updated);

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete software
router.delete("/:id", async (req, res) => {
  try {
    await TourSoftware.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;