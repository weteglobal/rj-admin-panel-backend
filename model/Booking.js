const mongoose = require("mongoose")

const bookingSchema = new mongoose.Schema({
  clientDetails: {
    name: { type: String, required: true },
    email: { type: String, },
    email2: { type: String, },
    phone: { type: String, required: true },
    adults: String,
    kids5to12: String,
    kidsBelow5: String,
    rooms: String,
    extraBeds: String,
    travelDate: { type: String, required: true },
    travelers: Number,
  },
  bookingId: { type: String },
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
  expenses: [
    {
      title: { type: String, },
      amount: { type: Number, },
      description: { type: String },
      date: { type: Date, default: Date.now }
    }
  ],
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
    pricing: mongoose.Schema.Types.Mixed,
    offers: mongoose.Schema.Types.Mixed,
    bookingAmount: Number,
    vehicle: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    hotels: mongoose.Schema.Types.Mixed,
    highlightPrice: Number,
    priceType: String,
    titles: [String],
    descriptions: [String],
    date: String,
    images: [String],
    tourcode: { type: String, default: '', trim: true },
    festivalOffer: {
      name: { type: String, },
      value: { type: Number, },
      selected: { type: Boolean, default: false }
    },
  },
  hotelSelections: mongoose.Schema.Types.Mixed,
  totalAmount: { type: Number, required: true },
  bookingAmount: Number,
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
      transactionId: { type: String },
      gateway: { type: String },
      paymentDate: { type: Date, default: Date.now },
      receiptUrl: { type: String },
      mobileNumber: { type: String },
      screenshot: { type: String },
      view: {
        type: String,
        default: "view"
      },
    },
  ],
  noteText: { type: String, default: "" },

  updateCount: { type: Number, default: 0 },
  approvel: {
    type: Boolean,
    default: false
  },
  addons: [
    {
      title: { type: String, },
      value: { type: Number, }
    }
  ],
  driverDetails: {
    name: { type: String },
    phone: { type: String },

  },
  driverAdvance: {
    number: { type: Number }
  },
  regularId: { type: String },

  // ✅ Trip Dates
  tripDates: {
    pickupDate: { type: String }, // Same as clientDetails.travelDate
    pickupLocation: { type: String }, // From location API
    tripEndDate: { type: String }, // Calculated from itinerary days
    dropoffLocation: { type: String }, // Last location in itinerary
  },

  createby: { type: Object },
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
  theme: {
    _id: { type: String },
    name: { type: String, default: "Default Theme" },
    link: {
      type: String,
      default: "viewData4",

    },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  contact: {
    type: Object
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },


}, { timestamps: true })




module.exports = mongoose.model("Booking", bookingSchema)
