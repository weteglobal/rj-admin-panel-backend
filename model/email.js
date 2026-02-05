const mongoose = require("mongoose");

const ItineraryEmailSchema = new mongoose.Schema({
    bookingId: { type: String, required: true },
    stringId: { type: String, },
    itineraryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Itinerary",
        required: false, // Optional as itinerary data is in booking
    },
    clientDetails: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String },
    },
    message: { type: String },
    status: {
        type: String,
        default: "pending",
    },
    itinerarydata: {
        type: Object
    },
    isSeen: { type: Boolean, default: false },
    seenAt: { type: Date },
    sendCount: { type: Number, default: 1 }, // Track number of sends/resends
    sentAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    declinedAt: { type: Date },
});

module.exports = mongoose.model("ItineraryEmail", ItineraryEmailSchema);