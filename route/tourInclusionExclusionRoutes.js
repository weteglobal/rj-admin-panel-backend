const express = require("express");
const multer = require("multer");
const path = require("path");
const TourInclusionExclusion = require("../model/tourInclusionExclusionSchema");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

function buildArray(prefix, req) {
  const titles = {};
  const descriptions = {};
  const imagePaths = {};
  const newImages = {};

  // Parse text fields from req.body
  for (let key in req.body) {
    const match = key.match(new RegExp(`^${prefix}(title|description|image_path)_(\\d+)`));
    if (match) {
      const field = match[1];
      const idx = parseInt(match[2]);
      if (field === "title") {
        titles[idx] = req.body[key];
      } else if (field === "description") {
        descriptions[idx] = req.body[key];
      } else if (field === "image_path") {
        imagePaths[idx] = req.body[key];
      }
    }
  }

  // Parse files
  if (req.files) {
    req.files.forEach((file) => {
      const match = file.fieldname.match(new RegExp(`^${prefix}image_(\\d+)`));
      if (match) {
        const idx = parseInt(match[1]);
        newImages[idx] = file.path;
      }
    });
  }

  // Get all indices
  const indices = new Set([
    ...Object.keys(titles).map(Number),
    ...Object.keys(descriptions).map(Number),
    ...Object.keys(imagePaths).map(Number),
    ...Object.keys(newImages).map(Number),
  ]);

  // Build array
  const arr = Array.from(indices)
    .sort((a, b) => a - b)
    .map((idx) => ({
      title: titles[idx] || "",
      description: descriptions[idx] || "",
      image: newImages[idx] || imagePaths[idx] || "",
    }))
    .filter((item) => item.title.trim() || item.description.trim() || item.image.trim());

  return arr;
}

// ✅ Get single document
router.get("/", async (req, res) => {
  try {
    let data = await TourInclusionExclusion.findOne();
    if (!data) {
      // Agar DB me nahi hai to default create kar do
      data = new TourInclusionExclusion();
      await data.save();
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Create / Update single document
router.post("/", upload.any(), async (req, res) => {
  try {
    let data = await TourInclusionExclusion.findOne();
    if (data) {
      // Update existing
      data.inclusions = buildArray("inclusions_", req);
      data.exclusions = buildArray("exclusions_", req);
      data.termsAndConditions = buildArray("termsAndConditions_", req);
      data.cancellationAndRefundPolicy = buildArray("cancellationAndRefundPolicy_", req);
      data.travelRequirements = buildArray("travelRequirements_", req);
      await data.save();
    } else {
      // Create new
      data = new TourInclusionExclusion({
        inclusions: buildArray("inclusions_", req),
        exclusions: buildArray("exclusions_", req),
        termsAndConditions: buildArray("termsAndConditions_", req),
        cancellationAndRefundPolicy: buildArray("cancellationAndRefundPolicy_", req),
        travelRequirements: buildArray("travelRequirements_", req),
      });
      await data.save();
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ Delete (optional)
router.delete("/", async (req, res) => {
  try {
    await TourInclusionExclusion.deleteMany({});
    res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;