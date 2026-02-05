const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../model/user/user");

async function seedAdmin() {
  try {
    const adminExists = await User.findOne({ email:process.env.EMAIL_ADMIN });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.PASSWORD_ADMIN, 10);
      const admin = new User({
        name: "Admin",
        email: process.env.EMAIL_ADMIN,
        password: hashedPassword,
        role: "admin",
        permissions: ["all"],
        status: "active",
      });
      await admin.save();
      console.log("Static admin created");
    } else {
      console.log("Admin already exists");
    }
  } catch (err) {
    console.error("Error seeding admin:", err);
  }
}

module.exports = seedAdmin;