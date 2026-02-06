// routes/api/emails.js  (FULL FINAL VERSION - Nov 2025)

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ItineraryEmail = require("../model/email");               // ← stringId wala model
const Booking = require("../model/pendingitineraray");
const TourSoftwareModel = require("../model/TourSoftwareModel");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const JWT_SECRET = process.env.JWT_SECRET;
// SMTP
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const serverBase = process.env.SERVER_BASE_URL || "https://rj-admin-panel-backend.onrender.com";
const clientBase = process.env.CLIENT_BASE_URL || "https://tour.rajasthantouring.in";


const authMiddleware = (req, res, next) => {

    const token = req.cookies.token || req.cookies.admin_token || req.cookies.user_token; // Check both token and admin_token


    if (!token) return res.status(401).json({ message: "Not authenticated" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.log(err, "stata");
        return res.status(401).json({ message: "Invalid token" });
    }
};

async function generateQuotationEmail({ booking, email, clientName, emailRecord, isResend = false }) {
    const software = (await TourSoftwareModel.findOne()) || {
        companyName: "Rajasthan Touring",
        year: new Date().getFullYear()
    };

    const viewLink = `${clientBase}/Senduser${booking.theme?.link || "viewData"}/${booking._id || booking.bookingId}?emailId=${email}`;

    let categoryRows = "";
    let totalCategories = 0;

    if (booking.totalAmount && typeof booking.totalAmount === "object") {
        for (const [cat, amount] of Object.entries(booking.totalAmount)) {
            if (typeof amount === "number" && amount > 0) {
                const cleanCat = cat.trim().replace(/\b\w/g, l => l.toUpperCase());
                categoryRows += `<tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">${cleanCat} Hotels Package</td></tr>`;
                totalCategories++;
            }
        }
    }

    if (totalCategories === 0) {
        categoryRows = `<tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">No package options available yet</td></tr>`;
    }

    const resendNotice = isResend
        ? `<div style="background-color: #fff3cd; padding: 12px; margin-bottom: 20px; border-left: 4px solid #ffc107; border-radius: 4px;">
        <p style="margin: 0; color: #333;">This is a re-sent quotation email.</p>
       </div>`
        : "";

    const packageMessage = totalCategories > 1
        ? `We are pleased to share ${totalCategories} package options:`
        : "Here is your customized itinerary package option:";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Verdana; line-height: 1.6; color: #333; background-color: #f9f9f9; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 30px;">
    
    
    <p style="margin-bottom: 20px;">Dear <strong>${clientName}</strong>,</p>
    <p style="margin-bottom: 20px; font-style: italic;">
  "Khammaghani" 
</p>
    
    <p style="margin-bottom: 20px;">Greetings from <strong>${software.companyName}</strong>! <br>
     Thank you for your interest in our Rajasthan tour package. Please find below the proposed trip details and the link to view your complete quotation online.</p>
    ${resendNotice}
    
    <p style="margin-bottom: 12px;"><strong>${packageMessage}</strong></p>
    
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8f9fa;">
      ${categoryRows}
    </table>
    
    <p style="margin-bottom: 20px;">Kindly review the package options and let us know which one suits you best. We would be happy to customize the itinerary as per your requirements.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${viewLink}" style="display: inline-block; background-color: #3498db; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">View Full Quotation</a>
    </div>
    
    <hr style="border: none; border-top: 2px solid #ecf0f1; margin: 20px 0;">
    
    <p style="margin-bottom: 8px;">Warm regards,</p>
    <p style="margin: 0 0 20px 0; font-weight: bold;">${booking.contact?.name}</p>
    <p style="margin: 0; color: #7f8c8d; font-weight: bold;">${software.companyName}</p>
    
    <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
    
    <p style="text-align: center; color: #95a5a6; font-size: 12px; margin: 0;">Copyright ${new Date().getFullYear()} ${software.companyName}. All rights reserved.</p>
  </div>
</body>
</html>`;
}

// ====================== SEND NEW QUOTATION ======================
router.post("/send", async (req, res) => {
    try {
        const { bookingId, clientDetails } = req.body;
        if (!bookingId || !clientDetails?.email || !clientDetails?.name) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }
        const booking = await Booking.findById(bookingId).lean();
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const humanBookingId = booking.bookingId || booking._id.toString();

        const emailRecord = new ItineraryEmail({
            bookingId: booking._id.toString(),      // MongoDB _id
            stringId: humanBookingId,               // ← QRT240 (human readable)
            clientDetails,
            status: "pending",
            isSeen: false,
            sendCount: 1,
            sentAt: new Date(),
        });
        await emailRecord.save();

        const html = await generateQuotationEmail({
            booking,
            clientName: clientDetails.name,
            email: clientDetails.email,
            emailRecord,
            isResend: false
        });

        const software = await TourSoftwareModel.findOne();
        await transporter.sendMail({
            from: `"${software?.companyName || "Rajasthan Touring"}" <${process.env.EMAIL_USER}>`,
            to: clientDetails.email,
            bcc: clientDetails.email2 || undefined,
            subject: `Rajasthan Trip Quotation For ${clientDetails.name.trim()}`,
            html,
        });

        res.json({ success: true, message: "Quotation sent successfully", emailRecord });
    } catch (err) {
        console.error("Send error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================== SEND CUSTOM FRONTEND EMAIL (NO DATABASE SAVE) ======================
router.post("/send-custom", async (req, res) => {
    try {
        const { clientDetails, htmlMessage } = req.body;

        if (!clientDetails?.email || !clientDetails?.name) {
            return res.status(400).json({ success: false, message: "Missing email or name" });
        }

        if (!htmlMessage) {
            return res.status(400).json({ success: false, message: "Missing HTML message" });
        }

        const software = await TourSoftwareModel.findOne();

        // ⭐ SEND EMAIL DIRECTLY (NO SAVE)
        await transporter.sendMail({
            from: `"${software?.companyName || "Rajasthan Touring"}" <${process.env.EMAIL_USER}>`,
            to: clientDetails.email,
            subject: `Rajasthan Trip Quotation for ${clientDetails.name}`,
            html: htmlMessage, // ⭐ EXACT SAME HTML FROM FRONTEND
        });

        return res.json({
            success: true,
            message: "Custom quotation sent successfully",
        });

    } catch (err) {
        console.error("Email Send Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});


// ====================== RESEND QUOTATION ======================
router.post("/resend/:id", async (req, res) => {
    try {
        const bookingId = req.params.id;
        const booking = await Booking.findById(bookingId).lean();
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const humanBookingId = booking.bookingId || booking._id.toString();

        let emailRecord = await ItineraryEmail.findOne({ bookingId: booking._id.toString() });
        if (!emailRecord) {
            emailRecord = new ItineraryEmail({
                bookingId: booking._id.toString(),
                stringId: humanBookingId,
                clientDetails: booking.clientDetails,
                status: "pending",
                isSeen: false,
                sendCount: 1,
                sentAt: new Date(),
            });
        } else {
            emailRecord.sendCount += 1;
            emailRecord.sentAt = new Date();
            emailRecord.stringId = humanBookingId;
        }
        await emailRecord.save();

        const html = await generateQuotationEmail({
            booking,
            clientName: booking.clientDetails.name,
            email: booking.clientDetails.email,
            emailRecord,
            isResend: true
        });

        const software = await TourSoftwareModel.findOne();
        await transporter.sendMail({
            from: `"${software?.companyName || "Rajasthan Touring"}" <${process.env.EMAIL_USER}>`,
            to: booking.clientDetails.email,
            bcc: booking.clientDetails.email2 || undefined,
            subject: `Rajasthan Trip Quotation For ${booking.clientDetails.name} (Resent)`,
            html,
        });

        res.json({ success: true, message: "Quotation re-sent", emailRecord });
    } catch (err) {
        console.error("Resend error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================== TRACKING PIXEL ======================
router.get("/track/:id", cors(), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).send("Invalid ID");

        const record = await ItineraryEmail.findByIdAndUpdate(
            req.params.id,
            { $set: { isSeen: true, seenAt: new Date() } },
            { new: true }
        );

        const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64");
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Length": pixel.length });
        res.end(pixel);
    } catch (err) {
        res.status(500).send("Error");
    }
});


router.get("/summary", authMiddleware, async (req, res) => {
    try {
        const user = req.user;

        let matchCondition = {};  // default → admin sees all

        // ===========================
        // 🔥 NON ADMIN → FILTER DATA
        // ===========================
        if (user.role !== "admin") {

            // Find all bookings created by this user
            const userBookings = await Booking.find({
                "createby._id": user.id   // String compare only
            }).select("_id");

            const bookingIds = userBookings.map(b => b._id.toString());

            // Apply filter for summary queries
            matchCondition = { bookingId: { $in: bookingIds } };
        }

        // ===========================
        // SUMMARY COUNTS
        // ===========================

        const totalSent = await ItineraryEmail.countDocuments(matchCondition);

        const pending = await ItineraryEmail.countDocuments({
            ...matchCondition,
            status: "pending"
        });

        const seen = await ItineraryEmail.countDocuments({
            ...matchCondition,
            isSeen: true
        });

        const unseen = await ItineraryEmail.countDocuments({
            ...matchCondition,
            isSeen: false
        });

        const totalSendsAgg = await ItineraryEmail.aggregate([
            { $match: matchCondition },
            { $group: { _id: null, total: { $sum: "$sendCount" } } }
        ]);

        res.json({
            success: true,
            totalSent,
            pending,
            seen,
            unseen,
            totalSends: totalSendsAgg[0]?.total || 0
        });

    } catch (err) {
        console.error("Error fetching summary:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});



// ====================== MARK AS SEEN BY EMAIL ID ======================
router.post("/mark-seen/:email/:bookingId", async (req, res) => {
    try {
        const { email, bookingId } = req.params;
        console.log(email, bookingId);



        const objectBookingId = new mongoose.Types.ObjectId(bookingId);

        // 🔥 Find using ObjectId bookingId
        const emailRecord = await ItineraryEmail.findOne({ bookingId: objectBookingId });

        if (!emailRecord) {
            return res.status(404).json({ success: false, message: "Email record not found" });
        }

        if (!emailRecord.isSeen) {
            emailRecord.isSeen = true;
            emailRecord.seenAt = new Date();
            await emailRecord.save();
            console.log(`Booking ${bookingId} marked as seen.`);
        }

        res.json({ success: true, emailRecord });

    } catch (err) {
        console.error("Error marking as seen:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


router.post("/send-email", async (req, res) => {
    try {
        const { to, subject,bcc, body, html } = req.body;

        if (!to || !subject || (!body && !html)) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Travel Team" <${process.env.EMAIL_USER}>`,
            to,
            bcc,
            subject,
            text: body,   // fallback for clients that don’t support HTML
            html: html,   // HTML body
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
        console.error("Email error:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
});



router.get("/", authMiddleware, async (req, res) => {
    try {
        console.log("USER FROM TOKEN:", req.user);

        const user = req.user;
        console.log("USER FROM TOKEN:", req.user);


        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        let emails;

        // ============================
        // 🔥 1. ADMIN → Show All Emails
        // ============================
        if (user.role === "admin") {
            emails = await ItineraryEmail.find().sort({ sentAt: -1 });
            return res.json({ success: true, emails });
        }

        // ==============================================
        // 🔥 2. NON-ADMIN → Show Only Their Own Bookings
        // ==============================================
        // Step 1: Find all bookings created by this user
        const userBookings = await Booking.find({
            "createby._id": user.id   // <-- match STRING with STRING
        }).select("_id");


        const userBookingIds = userBookings.map(b => b._id.toString());
        console.log(userBookings, 'userbookingata');

        // Step 2: Filter emails where bookingId matches user's bookings
        emails = await ItineraryEmail.find({
            bookingId: { $in: userBookingIds }
        }).sort({ sentAt: -1 });


        return res.json({ success: true, emails });

    } catch (err) {
        console.error("Error fetching emails:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});



module.exports = router;