const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        user: { type: Object, required: true }, // full user object stored here
        vehicle: { type: Object, required: true }, // full vehicle object stored here

        pickupLocation: { type: String, required: true },
        dropLocation: { type: String, required: true },
        pickupDate: { type: Date, required: true },
        dropDate: { type: Date, required: true },
        days: { type: Number, required: true },
        passengers: { type: Number, default: 1 },
        totalAmount: { type: Number, required: true },
        payments: [{
            title: { type: String, required: true },
            amount: { type: Number, required: true },
            date: { type: Date, default: Date.now }
        }],
        paymentStatus: {
            type: String,
            enum: ["Pending", "Paid"],
            default: "Pending",
        },
        bookingStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
            default: "Confirmed",
        },
        notes: String,
    },
    { timestamps: true }
);

module.exports = mongoose.model("Carrentel", bookingSchema);