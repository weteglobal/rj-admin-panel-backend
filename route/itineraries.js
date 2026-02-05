const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Itinerary } = require("../model/Itinerary");

// Verify the Category model path and import
let Category;
try {
  Category = require("../model/hotel/Category");
} catch (err) {
  console.error("Failed to import Category model:", err);
  Category = null; // Fallback to prevent crashes
}

const router = express.Router();

// Set up storage for file uploads
const itinerariesDir = path.join(__dirname, "../uploads/itineraries");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, itinerariesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const prefix = req.baseUrl.includes("locations") ? "location" : "itinerary";
    cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
});

const uploadMiddleware = upload.any();

const getAvailableCategories = async () => {
  try {
    if (!Category) {
      console.warn("Category model is not defined. Returning empty categories.");
      return [];
    }
    const categories = await Category.find();
    // Return both original name and normalized key for matching
    return categories.map((cat) => ({
      name: cat.name, // Original name with spaces
      key: cat.name // Normalized key for matching
    }));
  } catch (err) {
    console.error("Error fetching categories:", err);
    return [];
  }
};


// Helper function to match category keys while preserving original names
const buildPackagePricing = (parsedPricing, availableCategories) => {
  const result = {};

  if (availableCategories.length > 0) {
    availableCategories.forEach((category) => {
      // Match using normalized key, but store with original name
      const matchedValue = parsedPricing[category.key];
      const val = Number(matchedValue);
      result[category.name] = isNaN(val) ? 0 : val; // Use original name as key
    });
  } else {
    // Fallback: if no categories, use incoming keys as-is
    Object.keys(parsedPricing).forEach((key) => {
      const val = Number(parsedPricing[key]);
      result[key] = isNaN(val) ? 0 : val;
    });
  }

  return result;
};

// ================== ROUTES =====================

// Get all itineraries
router.get("/", async (req, res) => {
  try {
    const itineraries = await Itinerary.find();
    res.json(itineraries);
  } catch (err) {
    console.error("Error fetching itineraries:", err);
    res.status(500).json({ error: "Failed to fetch itineraries" });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);
    if (!itinerary) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    res.json(itinerary);
  } catch (err) {
    console.error("Error fetching itinerary by ID:", err);
    res.status(500).json({ error: "Failed to fetch itinerary" });
  }
});

// Create itinerary
router.put("/:id", uploadMiddleware, async (req, res) => {
  try {
    const { titles, descriptions, date, duration, packagePricing, days, existingImages, tourcode } = req.body;


    const itinerary = await Itinerary.findById(req.params.id);
    if (!itinerary) {
      return res.status(404).json({ error: "Itinerary not found" });
    }

    const dayImages = {};
    req.files.forEach((file) => {
      if (file.fieldname.startsWith("dayImages_")) {
        const dayIndex = Number.parseInt(file.fieldname.replace("dayImages_", ""), 10);
        if (!dayImages[dayIndex]) {
          dayImages[dayIndex] = [];
        }
        dayImages[dayIndex].push(`/uploads/itineraries/${file.filename}`);
      }
    });

    // Set main images to kept existing + new
    const parsedExistingImages = existingImages ? JSON.parse(existingImages) : [];
    const newMainImages = req.files
      .filter((file) => file.fieldname === "images")
      .map((file) => `/uploads/itineraries/${file.filename}`) || [];
    itinerary.images = [...parsedExistingImages, ...newMainImages];

    console.log(parsedExistingImages);



    itinerary.titles = JSON.parse(titles);
    itinerary.descriptions = JSON.parse(descriptions);
    itinerary.date = new Date();
    itinerary.duration = duration;
    // Accept tourcode if provided, otherwise keep existing or default
    if (typeof tourcode === 'string') itinerary.tourcode = tourcode || itinerary.tourcode;

    let processedPackagePricing = {};
    const availableCategories = await getAvailableCategories();

    if (packagePricing) {
      availableCategories.forEach((category) => {
        processedPackagePricing[category.name] = 0;
      });
    } else if (availableCategories.length > 0) {
      // Initialize with 0 for all available categories (using original names)
      availableCategories.forEach((category) => {
        processedPackagePricing[category.name] = 0;
      });
    }

    if (Object.keys(processedPackagePricing).length === 0) {
      processedPackagePricing["default"] = 0;
    }

    itinerary.packagePricing = processedPackagePricing;

    const parsedDays = JSON.parse(days);
    itinerary.days = parsedDays.map((day, index) => ({
      ...day,
      images: [...(day.images || []), ...(dayImages[index] || [])], // kept existing + new
    }));

    await itinerary.save();
    console.log("Updated itinerary:", itinerary.toObject());
    res.json(itinerary);
  } catch (err) {
    console.error("Error in PUT /itineraries/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", uploadMiddleware, async (req, res) => {
  try {
    const { titles, descriptions, date, duration, packagePricing, days, tourcode } = req.body;

    console.log(packagePricing);


    if (!titles || !descriptions) {
      return res.status(400).json({ error: "Titles, descriptions are required" });
    }

    const parsedTitles = JSON.parse(titles);
    const parsedDescriptions = JSON.parse(descriptions);
    const parsedDays = JSON.parse(days);

    const dayImages = {};
    req.files.forEach((file) => {
      if (file.fieldname.startsWith("dayImages_")) {
        const dayIndex = Number.parseInt(file.fieldname.replace("dayImages_", ""), 10);
        if (!dayImages[dayIndex]) {
          dayImages[dayIndex] = [];
        }
        dayImages[dayIndex].push(`/uploads/itineraries/${file.filename}`);
      }
    });

    let processedPackagePricing = {};
    const availableCategories = await getAvailableCategories();
    console.log(availableCategories);

    if (packagePricing) {
      const parsedPricing = JSON.parse(packagePricing);

      // normalize incoming pricing keys
      const normalizedPricing = {};
      Object.keys(parsedPricing).forEach((key) => {
        const nk = key.toLowerCase().replace(/\s+/g, "");
        normalizedPricing[nk] = Number(parsedPricing[key]) || 0;
      });

      // match category keys
      availableCategories.forEach((cat) => {
        processedPackagePricing[cat.name] = normalizedPricing[cat.key] || 0;
      });

    } else {
      // if no pricing sent → initialize default 0
      availableCategories.forEach((cat) => {
        processedPackagePricing[cat.name] = 0;
      });
    }

    if (Object.keys(processedPackagePricing).length === 0) {
      processedPackagePricing["default"] = 0;
    }

    const newMainImages = req.files
      .filter((file) => file.fieldname === "images")
      .map((file) => `/uploads/itineraries/${file.filename}`) || [];

    const itinerary = new Itinerary({
      titles: parsedTitles,
      descriptions: parsedDescriptions,
      date: new Date(),
      duration,
      packagePricing: processedPackagePricing,
      days: parsedDays.map((day, index) => ({
        ...day,
        images: [...(day.images || []), ...(dayImages[index] || [])], // Merge existing (from JSON) + new
      })),
      images: newMainImages,
      tourcode: typeof tourcode === 'string' && tourcode ? tourcode : '',
    });

    await itinerary.save();
    console.log("Saved itinerary:", itinerary.toObject());
    res.status(201).json(itinerary);
  } catch (err) {
    console.log(err);

    console.error("Error in POST /itineraries:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete itinerary
router.delete("/:id", async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);
    if (!itinerary) {
      return res.status(404).json({ error: "Itinerary not found" });
    }

    itinerary.images.forEach((image) => {
      const fullPath = path.join(__dirname, "..", image);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    });

    itinerary.days.forEach((day) => {
      day.images?.forEach((image) => {
        const fullPath = path.join(__dirname, "..", image);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      });
    });

    await Itinerary.findByIdAndDelete(req.params.id);
    res.json({ message: "Itinerary deleted successfully" });
  } catch (err) {
    console.error("Error in DELETE /itineraries/:id:", err);
    res.status(500).json({ error: "Failed to delete itinerary" });
  }
});

module.exports = router;