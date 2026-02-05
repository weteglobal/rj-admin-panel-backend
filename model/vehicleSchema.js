const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    model: { type: String, required: true },
    image: { type: String },
    capacity: { type: Number }, // या String अगर आप "7 Seater" जैसे values रखना चाहें
    type: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
