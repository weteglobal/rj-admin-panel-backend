const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  companyLogo: { type: String }, // Path/filename of uploaded logo
  companyAddress: { type: String },
  companyGST: { type: String },
  companyEmail: { type: String },
  companyPhone: { type: String },
  notes: { type: String },
  billStartText: { type: String, default: "INV" }, // default example
  billStartNumber: { type: String, default: "001" }, // keep as string for leading zeros
  reviewLink: { type: String, default: "" }, // optional link for reviews
}, { timestamps: true });

module.exports = mongoose.model("Companybilldata", companySchema);
