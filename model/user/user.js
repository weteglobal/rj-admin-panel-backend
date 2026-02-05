const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "manager", "staff", "user"],
      default: "user",
    },
    role2: {
      type: String,
      default: "user",
    },
    permissions: [{ type: String }],
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    profilePhoto: { type: String }, // Store URL or path to profile photo
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
    isSuperAdmin: { type: Boolean, default: false },

    plainPassword: String, // add this field for admin view only
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);