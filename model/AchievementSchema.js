
const mongoose = require("mongoose");

const AchievementSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true } // Only image
});

const achievements = new mongoose.Schema(
  {
    name: { type: String, required: true },         // e.g. "Rajasthan Tour Package"
    description: [{ type: String, required: true }], // Array of descriptions
    achievements: [AchievementSchema],               // Only images
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("achiv", achievements);
