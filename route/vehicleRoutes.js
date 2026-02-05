const express = require("express");
const Vehicle = require("../model/vehicleSchema");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// ✅ Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ✅ Create Vehicle
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const vehicleData = {
      model: req.body.model,
      capacity: req.body.capacity ? parseFloat(req.body.capacity) : undefined,
      type: req.body.type,
      image: req.file ? `/uploads/${req.file.filename}` : null,
    };
    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ✅ Get All Vehicles
router.get("/", async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get Vehicle by ID
router.get("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Update Vehicle
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const vehicleData = {
      model: req.body.model,
      capacity: req.body.capacity ? parseFloat(req.body.capacity) : undefined,
      type: req.body.type,
      image: req.file ? `/uploads/${req.file.filename}` : req.body.image,
    };
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, vehicleData, {
      new: true,
    });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ✅ Delete Vehicle
router.delete("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;