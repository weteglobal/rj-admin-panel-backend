const mongoose = require("mongoose")

const itinerarySchema = new mongoose.Schema(
  {
    titles: [{ type: String, required: true, trim: true }],
    descriptions: [{ type: String, required: true, trim: true }],
    date: { type: Date },
    images: [{ type: String }],
  tourcode: { type: String,  trim: true },
    duration: { type: String },
    packagePricing: {
      type: Map,
      of: Number,
      default: {},
    },
    days: [
      {
        dayNumber: { type: Number, required: true },
        titles: [{ type: String }],
        descriptions: [{ type: String }],
        locations: [{ type: String }],
        images: [{ type: String }],
      },
    ],
  },
  { timestamps: true },
)

module.exports = {
  Itinerary: mongoose.model("Itinerary", itinerarySchema),
}