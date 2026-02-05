// models/Bill.js (Updated: Add vehicleName, legs array, totalRentalAmount)
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  description: String,
  tourCode: String,
  itineraryName: String,
  travelDate: String,
  vehicleName: String,
  pickupPoint: String,
  dropPoint: String,
  km: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 }
});

// New: Leg schema for car-rental
const legSchema = new mongoose.Schema({
  pickupPoint: String,
  dropPoint: String,
  km: { type: Number, default: 0 }
});

const bankDetailsSchema = new mongoose.Schema({
  bankName: String,
  accountNumber: String,
  ifscCode: String
});

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,
  district: String,
  state: String,
  phone: String,
  email: String,
  gstin: String
});

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,
  district: String,
  state: String,
  phone: String,
  email: String,
  gstin: String
});

const billSchema = new mongoose.Schema({
  type: { type: String, enum: ['invoice', 'quotation', 'paid','car-rental'], required: true },
  subtype: String, // e.g., 'car-rental', 'travel'
  company: companySchema,
  client: clientSchema,
  number: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  dueDate: Date,  // Invoice
  validUntil: Date,  // Quotation
  paymentDate: Date,  // Paid
  invoiceReference: String,  // Paid
  items: [itemSchema],  // For non-car-rental
  legs: [legSchema], // New: For car-rental
  vehicleName: String, // New: For car-rental
  totalRentalAmount: { type: Number, default: 0 }, // New: For car-rental
  amountPaid: { type: Number, default: 0 },  // For paid
  totalPaid: { type: Number, default: 0 },  // For invoice
  pendingAmount: { type: Number, default: 0 },  // For invoice
  paymentMethod: String,  // Paid
  driverLicense: String,
  driverVehicleNumber: String,
  aadhaarName: String,
  driverLicenseImage: String,
  vehicleRcImage: String,
  aadhaarImage: String,
  notes: String,
  terms: String,
  taxRate: { type: Number, default: 18 },
  bankDetails: bankDetailsSchema,
  logoUrl: String,
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bill', billSchema);