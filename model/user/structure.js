// schema.js
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  street: String,
  area: String,
  city: String,
  state: String,
  pincode: String,
  landmark: String,
});

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  emails: [{ type: String }],
  mobiles: [{ type: String }],
  addresses: [addressSchema],
  socialLinks: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String,
    website: String,
  },
});

const bankDetailSchema = new mongoose.Schema({
  bankName: String,
  ifscCode: String,
  accountName: String,
  accountNumber: String,
  accountType: String,
  logoUrl: String, // Add logoUrl field for bank logo
});

const paymentIdSchema = new mongoose.Schema({
  type: { type: String },
  value: { type: String },
  receiverName: { type: String },
   mobileNumber: { type: String },
  logoUrl: String, // Add logoUrl field for wallet logo
  qrImageUrl: String, // Add qrImageUrl field for QR image
});

const userSchema = new mongoose.Schema(
  {
    contacts: [contactSchema],
    addresses: [addressSchema],
    socialLinks: {
      facebook: String,
      
      instagram: String,
   
      youtube: String,
      website: String,
    },
    logo: { type: String },
    bankDetails: [bankDetailSchema],
    paymentIds: [paymentIdSchema],
    sosNumber: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("structure", userSchema); 