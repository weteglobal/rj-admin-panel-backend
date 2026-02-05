const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
    },
    packageTitle: {
      type: String,
    },
    message: {
      type: String
    },
    other: {
      type: String
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'ongoing', 'booked', 'cancelled'],
      default: 'pending'
    },
    cancelReason: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("InquiryWelcome", inquirySchema);