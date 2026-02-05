const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  images: {
    type: [String], // Array of image paths
    default: [],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Location', locationSchema);