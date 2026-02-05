const mongoose = require('mongoose');
const bookingSheetSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
  },
  sheetData: {
    rows: [
      {
        type: {
          type: String,
          enum: ['day', 'summary', 'transport'],
          default: 'day'
        },
        // DAY ROW FIELDS - Corrected Names
        date: String,
        place: String,
        hotelName: String,
        category: String,
        mealType: String,
        doubleRoomPrice: { type: Number, default: 0 },
        roomCount: { type: Number, default: 1 },
        totalRoomPrice: { type: Number, default: 0 },
        extraBedCount: { type: Number, default: 0 },
        extraBedPrice: { type: Number, default: 0 },
        totalExtraPrice: { type: Number, default: 0 },
        isModified: { type: Boolean, default: false },
        isSheetModified: { type: Boolean, default: false },
        isNew: { type: Boolean, default: false },
        isRemoved: { type: Boolean, default: false },
        hotelNotes: { type: String, default: "" },
        checkIn: String,
        checkOut: String,
        previousHotels: [{
          name: String,
          price: Number,
          mealType: String,
          category: String
        }],
        // SUMMARY ROW
        label: String,
        value: String,
        // TRANSPORT ROW - Updated Fields
        transportDetails: {
          perPerson: { type: Number, default: 0 },
          nights: { type: Number, default: 0 },
          parking: { type: Number, default: 0 },
          assistance: { type: Number, default: 0 },
          boat: { type: Number, default: 0 },
          // Updated: KM-based
          vehicleKm: { type: Number, default: 0 },
          vehiclePricePerKm: { type: Number, default: 0 }, // Changed name
          calculatedVehicleTotal: { type: Number, default: 0 },
          others: [
            {
              title: String,
              price: Number
            }
          ]
        }
      }
    ],
  
    budget: {
      pax: { type: Number, default: 0 },
      hotelTotal: { type: Number, default: 0 },
      transportTotal: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      additionalChargesTotal: { type: Number, default: 0 }
    }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('BookingSheet', bookingSheetSchema);