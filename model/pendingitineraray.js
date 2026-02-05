// Schema remains unchanged as Mixed handles the structures
const mongoose = require("mongoose")

const bookingSchema = new mongoose.Schema({
  clientDetails: {
    name: { type: String, required: true },
    email: { type: String },
    email2: { type: String, default: "" },
    phone: { type: String, required: true },
    adults: String,
    kids5to12: String,
    kidsBelow5: String,
    rooms: String,
    extraBeds: String,
    travelDate: { type: String, required: true },
    travelers: Number,
  },
  parentBookingId: { type: String },
  versionNumber: { type: Number, default: 1 },
  isLatest: { type: Boolean, default: false }
  ,
  bookingId: { type: String, required: true, },
  selectedItinerary: {
    _id: String,
    titles: [String],
    descriptions: [String],
    date: String,
    duration: String,
    images: [String],
    packagePricing: mongoose.Schema.Types.Mixed,
    days: [
      {
        id: Number,
        title: String,
        description: String,
        location: String,
        images: [String],
      },
    ],
    tourcode: { type: String, default: '', trim: true },
  },
  inclusions: {
    type: Object,
  },
  exclusions: {
    type: Object,

  },
  termsAndConditions: {
    type: Object,
  },
  cancellationAndRefundPolicy: {
    type: Object,
  },
  travelRequirements: {
    type: Object,
  },
  itineraryData: {
    days: [
      {
        id: Number,
        titles: [String],
        descriptions: mongoose.Schema.Types.Mixed,
        locations: [String],
        images: [String],
      },
    ],
    pricing: mongoose.Schema.Types.Mixed, // Already Mixed, supports multiple categories
    offers: mongoose.Schema.Types.Mixed,   // Already Mixed
    bookingAmount: mongoose.Schema.Types.Mixed, // Changed to Mixed for category-wise
    vehicle: [Object],
    hotels: mongoose.Schema.Types.Mixed,   // Already Mixed, now will nest under categories and arrays per meal
    highlightPrice: mongoose.Schema.Types.Mixed, // Changed to Mixed for category-wise
    festivalOffer: mongoose.Schema.Types.Mixed, // NEW: Added for festival offer {name: string, value: number}
    priceType: String,
    titles: [String],
    descriptions: [String],
    duration: { type: String, default: '', },
    date: String,
    images: [String],
    tourcode: { type: String, default: '', trim: true },
  },
  hotelSelections: mongoose.Schema.Types.Mixed, // { category1: { day: { location: { meal: [id1, id2] } } }, category2: ... }
  userSelectedHotels: mongoose.Schema.Types.Mixed, // { category1: { day: { location: { meal: id } } }, ... }
  selectedCategory: { type: String, default: null },
  totalAmount: mongoose.Schema.Types.Mixed,  // Updated to Mixed for per-category objects
  grandTotal: { type: Number, default: 0 },  // Optional for summed total
  status: { type: String, default: "pending" },

  payments: [
    {
      status: {
        type: String,
        enum: ["pending", "success", "failed", "refunded"],
        default: "pending",
      },
      amount: { type: Number, required: true },
      currency: { type: String, default: "INR" },
      method: { type: String },
      // transactionId: { type: String },
      gateway: { type: String },
      paymentDate: { type: Date, default: Date.now },
      receiptUrl: { type: String },
      screenshot: { type: String },
      createdAt: { type: Date, default: Date.now },
      // mobileNumber: { type: String },
      view: {
        type: String,
        default: "view"
      },
    },
  ],
  approvel: {

    type: Boolean,
    default: false
  },
  updateCount: { type: Number, default: 0 },
  noteText: { type: String, default: "" },
  hotelSelectionDays: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Example: { "luxury": { 1: true, 2: false }, "deluxe": { 1: true } }
  },
  stayOnlyDays: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Example: { "luxury": { 1: true, 2: false }, "deluxe": { 1: true } }
  },
  daystay: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Example: { "luxury": { 1: "full", 2: "stay-only" }, "deluxe": { 1: "none" } }
  },
  createby: [Object],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  nextOffer: {
    type: {
      type: Boolean,
      default: false
    },
    value: {
      type: Number,
      default: 0
    },
    used: {
      type: String,
      enum: ["unuse", "used"], // Restrict to specific values
      default: "unuse",
    },
  },
  theme: {
    _id: { type: String },
    name: { type: String, default: "Default Theme" },
    link: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  contact: {
    type: Object
  },
  createby: { type: Object },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
})



module.exports = mongoose.model("PendingItinearrary", bookingSchema)