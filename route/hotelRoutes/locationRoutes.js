const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Location = require('../../model/hotel/Location');
const Hotel = require('../../model/hotel/Hotel');
const { Itinerary } = require('../../model/Itinerary');
const router = express.Router();

// Create absolute path for locations directory
const locationsDir = path.join(__dirname, "../../uploads/locations");

// Ensure folder exists (create it if not)
if (!fs.existsSync(locationsDir)) {
  fs.mkdirSync(locationsDir, { recursive: true });
  console.log("✅ Locations upload directory created:", locationsDir);
} else {
  console.log("📁 Locations upload directory already exists:", locationsDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, locationsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `location-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
 
});



const compressImage = async (inputPath, outputPath) => {
  try {
    const stats = fs.statSync(inputPath);
    const originalSizeMB = stats.size / (1024 * 1024);

    // Agar image < 1MB hai → chhod do
    if (originalSizeMB < 1) {
      if (inputPath !== outputPath) {
        fs.copyFileSync(inputPath, outputPath);
        fs.unlinkSync(inputPath);
      }
      return;
    }

    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Determine quality based on size
    let quality = 80;
    if (originalSizeMB > 8) quality = 50;
    else if (originalSizeMB > 5) quality = 60;
    else if (originalSizeMB > 3) quality = 70;

    // NO RESIZE → Keep original width/height
    await image
      .jpeg({ quality, progressive: true, optimizeScans: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true }) // Max compression
      .webp({ quality, lossless: false })
      .toFile(outputPath);

    // Delete original
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    const newSizeMB = fs.statSync(outputPath).size / (1024 * 1024);
    console.log(`Compressed: ${originalSizeMB.toFixed(2)} MB → ${newSizeMB.toFixed(2)} MB (Resolution: ${metadata.width}x${metadata.height})`);
  } catch (err) {
    console.error("Compression failed:", err);
  }
};


// GET all locations
router.get('/', async (req, res) => {
  try {
    const locations = await Location.find();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// CREATE location
// CREATE location
router.post('/', upload.array('images', 20), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name required' });

    const imagePaths = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const compressedPath = file.path; // Overwrite same file
        await compressImage(file.path, compressedPath);
        imagePaths.push(`/uploads/locations/${file.filename}`);
      }
    }

    const location = new Location({ name: req.body.name, images: imagePaths });
    await location.save();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// UPDATE location
router.put('/:id', upload.array('images', 20), async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Update name
    location.name = req.body.name || location.name;

    // Handle images - UPDATE PATHS ONLY, DON'T DELETE FILES
    const parsedExistingImages = req.body.existingImages ? JSON.parse(req.body.existingImages) : location.images;
    const newImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filePath = file.path;

        // Compress image (same resolution, only reduce file size)
        await compressImage(filePath, filePath); // Overwrite with compressed version

        // Add to new images list
        newImages.push(`/uploads/locations/${file.filename}`);
      }
    }
    //

    // ❌ REMOVE THIS - Don't delete actual image files
    // const oldImages = location.images;
    // const toDelete = oldImages.filter(img => !parsedExistingImages.includes(img));
    // toDelete.forEach((img) => {
    //   const fullPath = path.join(__dirname, '..', '..', img);
    //   if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    // });

    // Just update the paths array
    location.images = [...parsedExistingImages, ...newImages];

    // Save the updated location first
    await location.save();

    // Fetch all locations to build a map for efficient lookup
    const allLocations = await Location.find({}).lean();
    const locMap = new Map();
    allLocations.forEach(loc => locMap.set(loc.name, loc.images || []));

    // ✅ Update ONLY Itineraries (NOT Bookings)
    const itineraries = await Itinerary.find();
    let updatedItinerariesCount = 0;

    for (const itinerary of itineraries) {
      let itineraryUpdated = false;

      for (const day of itinerary.days) {
        if (day.locations && day.locations.includes(location.name)) {
          // Recompute images as union from all locations in this day
          let allImages = [];
          for (const locName of day.locations) {
            const images = locMap.get(locName) || [];
            allImages = allImages.concat(images);
          }
          // Remove duplicates
          day.images = [...new Set(allImages)];
          itineraryUpdated = true;
        }
      }

      if (itineraryUpdated) {
        await itinerary.save();
        updatedItinerariesCount++;
      }
    }

    console.log(`Updated ${updatedItinerariesCount} itineraries for location: ${location.name}`);

    res.json(location);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE location
router.delete('/:id', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Delete associated images files
    if (location.images && location.images.length > 0) {
      location.images.forEach((img) => {
        const fullPath = path.join(__dirname, '..', '..', img);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      });
    }

    // Fetch all locations to build a map (excluding the one being deleted, but since we filter it out, it's fine)
    const allLocations = await Location.find({}).lean();
    const locMap = new Map();
    allLocations.forEach(loc => locMap.set(loc.name, loc.images || []));

    // Update associated itineraries: remove location and recompute images for affected days
    const itineraries = await Itinerary.find();
    for (const itinerary of itineraries) {
      let updated = false;
      for (const day of itinerary.days) {
        if (day.locations && day.locations.includes(location.name)) {
          // Remove the location from the array
          day.locations = day.locations.filter(loc => loc !== location.name);
          // Recompute images from remaining locations
          let allImages = [];
          for (const locName of day.locations) {
            const images = locMap.get(locName) || [];
            allImages = allImages.concat(images);
          }
          // Remove duplicates
          day.images = [...new Set(allImages)];
          updated = true;
        }
      }
      if (updated) {
        await itinerary.save();
      }
    }

    // Delete associated hotels and location
    await Hotel.deleteMany({ locationId: req.params.id });
    await Location.findByIdAndDelete(req.params.id);
    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

module.exports = router;