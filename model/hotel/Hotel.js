const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  name: { type: String, required: true, trim: true },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  image: { type: String },
  price: {
    type: String,
    default: ''
  },
  // Optional: agar aap price range dena chahte ho (low-high)
  // priceRange: { min: Number, max: Number }
  googleReviewLink: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Hotel', hotelSchema);