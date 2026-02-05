const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Hotel = require('../../model/hotel/Hotel');
const Category = require('../../model/hotel/Category');
const Location = require('../../model/hotel/Location');

const router = express.Router();

const hotelsDir = path.join(__dirname, "../../uploads/hotels");

// Ensure folder exists (create if missing)
if (!fs.existsSync(hotelsDir)) {
  fs.mkdirSync(hotelsDir, { recursive: true });
  console.log("✅ Hotels upload directory created:", hotelsDir);
} else {
  console.log("📁 Hotels upload directory already exists:", hotelsDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, hotelsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `hotel-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,

 
});

// GET all hotels
router.get('/', async (req, res) => {
  try {
    const hotels = await Hotel.find()
      .populate('categoryId', 'name')
      .populate('locationId', 'name');
    res.json(hotels);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hotels' });
  }
});

// CREATE hotel
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, categoryId, locationId, rating, reviews, googleReviewLink ,price} = req.body;
    if (!name || !categoryId || !locationId) {
      return res.status(400).json({ error: 'Name, category, and location are required' });
    }
    if (rating && (rating < 0 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 0 and 5' });
    }
    if (reviews && reviews < 0) {
      return res.status(400).json({ error: 'Reviews cannot be negative' });
    }

    const category = await Category.findById(categoryId);
    const location = await Location.findById(locationId);
    if (!category || !location) {
      return res.status(404).json({ error: 'Invalid category or location' });
    }

    const hotel = new Hotel({
      categoryId,
      locationId,
      name,
      rating: rating ? Number(rating) : 0,
      reviews: reviews ? Number(reviews) : 0,
      price: price,
      googleReviewLink: googleReviewLink ? googleReviewLink.trim() : null,
      image: req.file ? `/uploads/hotels/${req.file.filename}` : null,
    });

    await hotel.save();
    const populatedHotel = await Hotel.findById(hotel._id)
      .populate('categoryId', 'name')
      .populate('locationId', 'name');
    res.status(201).json(populatedHotel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE hotel
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, categoryId, locationId, rating, reviews, googleReviewLink,price } = req.body;
    const hotel = await Hotel.findById(req.params.id);
    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    if (!name || !categoryId || !locationId) {
      return res.status(400).json({ error: 'Name, category, and location are required' });
    }
    if (rating && (rating < 0 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 0 and 5' });
    }
    if (reviews && reviews < 0) {
      return res.status(400).json({ error: 'Reviews cannot be negative' });
    }

    const category = await Category.findById(categoryId);
    const location = await Location.findById(locationId);
    if (!category || !location) {
      return res.status(404).json({ error: 'Invalid category or location' });
    }

    hotel.name = name;
    hotel.categoryId = categoryId;
    hotel.locationId = locationId;
    hotel.rating = rating ? Number(rating) : hotel.rating;
    hotel.reviews = reviews ? Number(reviews) : hotel.reviews;
    hotel.price = price
    hotel.googleReviewLink = googleReviewLink ? googleReviewLink.trim() : hotel.googleReviewLink;
    if (req.file) {
      if (hotel.image) {
        const fullPath = path.join(__dirname, '..', '..', hotel.image);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
      hotel.image = `/uploads/hotels/${req.file.filename}`;
    }

    await hotel.save();
    const populatedHotel = await Hotel.findById(hotel._id)
      .populate('categoryId', 'name')
      .populate('locationId', 'name');
    res.json(populatedHotel);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update hotel' });
  }
});

// DELETE hotel
router.delete('/:id', async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    if (hotel.image) {
      const fullPath = path.join(__dirname, '..', '..', hotel.image);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await Hotel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Hotel deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete hotel' });
  }
});

module.exports = router;