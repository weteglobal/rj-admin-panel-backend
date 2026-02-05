const mongoose = require("mongoose");

const tourSoftwareSchema = new mongoose.Schema({
  softwareName: {
    type: String,
    required: true,
    default: "Tour Software",
  },
  description: {
    type: String,
    required: true,
    default: "Custom Software for Travel Agency",
  },
  companyName: {
    type: String,
    required: true,
    default: "Jasper Software Solutions",
  },
  year: {
    type: Number,
    default: new Date().getFullYear(),
  },
  logo: {
    type: String, // uploaded image path
  },
  features: [
    {
      title: String,
      details: String,
    },
  ],
  headerLogo: {
    type: String, // New field for header logo image path
  },
  g2ReviewLink: { // New field for G2 review link
    type: String,
    default: '',
  },
  tripadviserlink: { // New field for G2 review link
    type: String,
    default: '',
  },
    // ⭐ NEW FIELDS
  tripadvisorRating: {
    type: Number,
    default: 0,
  },
  tripadvisorReviews: {
    type: Number,
    default: 0,
  },

  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  reviews: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("TourSoftwares", tourSoftwareSchema);