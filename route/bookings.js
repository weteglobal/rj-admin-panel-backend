const express = require("express")
const router = express.Router()
const Booking = require("../model/Booking")
const Hotel = require("../model/hotel/Hotel")
const ItineraryEmail = require("../model/email")
const Company = require("../model/Companybill")
const mongoose = require("mongoose")
const nodemailer = require("nodemailer")
const multer = require("multer")
const path = require("path")
const TourSoftwareModel = require("../model/TourSoftwareModel")
const Counter = require("../model/Counter")
const ExcelJS = require('exceljs');
const pendingitineraray = require("../model/pendingitineraray")
const { log } = require("console")
const { updateSheetWithBookingChanges } = require('./bookingSheetRoutes');
// Small helper
const serverBase = process.env.SERVER_BASE_URL || "https://apitour.rajasthantouring.in"
const clientBase = process.env.CLIENT_BASE_URL || "https://tour.rajasthantouring.in"
const JWT_SECRET = process.env.JWT_SECRET;

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/") // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`)
  },
})
const upload = multer({
  storage,
})


function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.admin_token;

    if (!token) {
      return res.status(401).json({ message: "Access denied: Admin login required" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check role
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Only admin users allowed" });
    }

    // Attach admin data to req
    req.admin = decoded;

    next();
  } catch (error) {
    console.error("Admin Auth Error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired admin token",
    });
  }
}
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
    pass: process.env.EMAIL_PASS || "bhsh nipi oory ayop",
  },
})
router.use(express.json())

// const parseTravelDate = (dateStr) => {
//   if (!dateStr) return new Date();
//   const parts = dateStr.split('-');
//   if (parts.length !== 3) return new Date();
//   let day, month, year;
//   if (parseInt(parts[0], 10) > 31) {
//     year = parseInt(parts[0], 10); month = parseInt(parts[1], 10); day = parseInt(parts[2], 10);
//   } else {
//     day = parseInt(parts[0], 10); month = parseInt(parts[1], 10); year = parseInt(parts[2], 10);
//   }
//   if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date();
//   const date = new Date(year, month - 1, day);
//   return isNaN(date.getTime()) ? new Date() : date;
// };

const safeISOString = (date) => {
  try { return date.toISOString(); } catch (e) { return new Date().toISOString(); }
};

// Helper to extract hotel ID or handle object/array
const extractHotelIdOrObject = (value) => {
  if (typeof value === 'string') {
    return { id: value, isObject: false };
  }
  if (typeof value === 'object' && value !== null) {
    // If it has .id, check if .id is array or object/string
    if (value.id) {
      if (Array.isArray(value.id)) {
        // Take first as primary, but preserve array if needed (for now, take first)
        return { id: value.id[0], fullValue: value.id, isArray: true, isObject: false };
      } else if (typeof value.id === 'string') {
        return { id: value.id, fullValue: value, isObject: false };
      } else if (typeof value.id === 'object') {
        return { id: value.id.id || value.id._id, fullValue: value.id, isObject: true };
      }
    }
    // Direct object (already full hotel)
    if (value._id || value.id) {
      return { id: value._id || value.id, fullValue: value, isObject: true };
    }
  }
  return { id: null, fullValue: null, isObject: false };
};

function parseTravelDate(dateString) {
  if (!dateString) return new Date();

  // Case 1: ISO format (yyyy-mm-dd)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day); // no timezone shift
  }

  // Case 2: dd-mm-yyyy format
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
    const [day, month, year] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  // Case 3: fallback
  return new Date(dateString);
}


const embedHotelData = async (bookingData) => {
  const updatedBookingData = { ...bookingData }
  const hotelSelections = updatedBookingData.hotelSelections || {}
  const itineraryHotels = updatedBookingData.itineraryData?.hotels || {}
  const travelDate = parseTravelDate(updatedBookingData.clientDetails?.travelDate)

  const hotelIds = new Set()
  // Collect all hotel IDs
  const collectHotelIds = (source) => {
    for (const day in source) {
      for (const location in source[day]) {
        for (const meal in source[day][location]) {
          const value = source[day][location][meal]
          const extracted = extractHotelIdOrObject(value)
          if (extracted.id && mongoose.Types.ObjectId.isValid(extracted.id)) {
            hotelIds.add(extracted.id)
          }
        }
      }
    }
  }

  collectHotelIds(hotelSelections)
  collectHotelIds(itineraryHotels)

  let hotels
  try {
    hotels = await Hotel.find({ _id: { $in: Array.from(hotelIds) } }).populate("categoryId locationId")
  } catch (error) {
    console.error("Error fetching hotels:", error)
    hotels = []
  }

  const hotelMap = new Map()
  hotels.forEach((hotel) => {
    hotelMap.set(hotel._id.toString(), {
      id: hotel._id.toString(),
      name: hotel.name,
      image: hotel.image || "",
      category: hotel.categoryId?.name || "N/A",
      location: hotel.locationId?.name || "N/A",
      rating: hotel.rating || 0,
      reviews: hotel.reviews || 0,
      googleReviewLink: hotel?.googleReviewLink
    })
  })

  // Collect all unique day numbers from both sources for gap handling
  const allDayStrs = new Set([
    ...Object.keys(hotelSelections),
    ...Object.keys(itineraryHotels)
  ])
  const sortedDays = Array.from(allDayStrs)
    .map(dayStr => parseInt(dayStr))
    .filter(day => !isNaN(day))
    .sort((a, b) => a - b)

  // Meal priority mapping
  const mealPriority = { breakfast: 1, lunch: 2, dinner: 3 }

  const processHotels = (source, sortedDays, travelDate) => {
    for (const dayStr in source) {
      const day = parseInt(dayStr)
      if (isNaN(day)) continue

      const idx = sortedDays.indexOf(day)
      if (idx === -1) continue

      const mealsPerLocations = source[dayStr]

      // Find max priority across all locations and meals in the day
      let maxPriority = 0
      for (const loc in mealsPerLocations) {
        const meals = mealsPerLocations[loc]
        for (const meal in meals) {
          if (meals[meal] && mealPriority[meal] > maxPriority) {
            maxPriority = mealPriority[meal]
          }
        }
      }

      const baseDate = new Date(travelDate)
      const dayStart = new Date(baseDate)
      dayStart.setDate(baseDate.getDate() + (day - 1))

      // Determine next day start for overnight extension (handles gaps)
      let nextDayStart
      if (idx < sortedDays.length - 1) {
        const nextDay = sortedDays[idx + 1]
        const nextBase = new Date(travelDate)
        nextBase.setDate(nextBase.getDate() + (nextDay - 1))  // Ensure this is setDate, not setMonth!
        nextDayStart = nextBase
      } else {
        nextDayStart = new Date(dayStart)
        nextDayStart.setDate(dayStart.getDate() + 1)  // Ensure setDate here too
      }

      for (const location in source[dayStr]) {
        const meals = source[dayStr][location]
        for (const meal in meals) {
          const value = meals[meal]
          if (!value) continue

          const mealPri = mealPriority[meal] || 0
          const checkIn = new Date(dayStart)
          let checkOut = new Date(dayStart)
          // Only extend for the biggest meal(s) in the day
          if (mealPri === maxPriority && maxPriority > 0) {
            checkOut = new Date(nextDayStart)
          }

          const dates = { checkIn: safeISOString(checkIn), checkOut: safeISOString(checkOut) }
          source[dayStr][location][meal] = processMealValue(value, dates)
        }
      }
    }
  }

  const processMealValue = (value, dates) => {
    const extracted = extractHotelIdOrObject(value)
    if (extracted.isObject) {
      return { ...extracted.fullValue, ...dates }
    } else if (extracted.isArray) {
      const firstHotel = extracted.fullValue[0] || {}
      if (extracted.id && hotelMap.has(extracted.id)) {
        return { ...hotelMap.get(extracted.id), ...dates }
      } else {
        return { ...firstHotel, ...dates }
      }
    } else if (extracted.id && hotelMap.has(extracted.id)) {
      return { ...hotelMap.get(extracted.id), ...dates }
    } else if (extracted.fullValue) {
      return { ...extracted.fullValue, ...dates }
    } else {
      return {
        id: extracted.id || (typeof value === 'string' ? value : null),
        name: extracted.id && mongoose.Types.ObjectId.isValid(extracted.id) ? "Hotel Not Found" : "Invalid Hotel ID",
        image: "",
        category: "N/A",
        location: "N/A",
        rating: 0,
        reviews: 0,
        ...dates,
      }
    }
  }

  processHotels(hotelSelections, sortedDays, travelDate)
  processHotels(itineraryHotels, sortedDays, travelDate)

  updatedBookingData.hotelSelections = hotelSelections
  if (updatedBookingData.itineraryData) {
    updatedBookingData.itineraryData.hotels = itineraryHotels
  }

  return updatedBookingData
}


// Function to send email on booking save/update
// Function to send email on booking save/update
const sendBookingEmail = async (booking) => {
  try {
    if (!booking.clientDetails?.email) return;

    // Find email record
    let emailRecord = await ItineraryEmail.findOne({
      bookingId: booking.bookingId || booking._id
    });

    const softwardata = await TourSoftwareModel.findOne();
    const companyName = softwardata.companyName;

    // ==========================
    // ✅ FIRST SUCCESSFUL PAYMENT
    // ==========================
    const firstPayment = booking.payments?.find(p => p.status === "success");
    const firstPaymentAmount = firstPayment ? `₹${firstPayment.amount}` : "20%";

    // ==========================
    // ✅ TRAVEL START → END DATE
    // ==========================
    const startDate = booking.clientDetails.travelDate; // DD-MM-YYYY format

    const [DD, MM, YYYY] = startDate.split("-");
    const jsStartDate = new Date(`${YYYY}-${MM}-${DD}`);

    const daysCount = booking.itineraryData?.days?.length || 1;

    const jsEndDate = new Date(jsStartDate);
    jsEndDate.setDate(jsEndDate.getDate() + (daysCount - 1));

    const formatDate = (d) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    const endDate = formatDate(jsEndDate);

    // Package name
    const packageName = booking.itineraryData?.titles?.[0] || "Rajasthan Trip";

    // Confirmation No
    const confirmationNumber = booking.bookingId;

    // ==========================================
    // ✅ FINAL ITINERARY CONFIRMATION MESSAGE
    // (EMAIL + WHATSAPP SAME)
    // ==========================================
    const confirmationMessage = `
Rajasthan Trip – Booking & Payment Confirmation

Dear ${booking.clientDetails.name},

"Khammaghani"

Thank you for your ${firstPaymentAmount} advance payment. Your booking is confirmed!

Confirmation No.: ${confirmationNumber}

Payment Schedule:
• ${firstPaymentAmount} – Received
• 30% – At hotel confirmation & voucher issuance
• 50% – On arrival (Day 1) in cash

We’ve started processing your hotel bookings and will share the confirmation vouchers soon.

Trip Dates: ${startDate} – ${endDate}
Package: ${packageName}

If you need any help, feel free to contact us anytime.
${companyName}
`;

    // ==========================================
    // 🔄 UPDATE / CREATE EMAIL RECORD
    // ==========================================
    if (emailRecord) {
      emailRecord.itineraryId = booking.selectedItinerary?._id;
      emailRecord.clientDetails = booking.clientDetails;
      emailRecord.itinerarydata = booking;
      emailRecord.status = "pending";
      emailRecord.isSeen = false;
      emailRecord.sendCount = (emailRecord.sendCount || 0) + 1;
      emailRecord.message = confirmationMessage;
      emailRecord.updatedAt = Date.now();
      await emailRecord.save();
    } else {
      emailRecord = new ItineraryEmail({
        bookingId: booking.bookingId || booking._id,
        itineraryId: booking.selectedItinerary?._id,
        clientDetails: booking.clientDetails,
        itinerarydata: booking,
        message: confirmationMessage,
        status: "pending",
        sendCount: 1,
      });
      await emailRecord.save();
    }

    // Tracking pixel
    const trackingPixel = `<img src="${serverBase}/api/emails/track/${emailRecord._id}" width="1" height="1" style="display:none;" />`;

    const viewLink = `${clientBase}/${booking.theme?.link || "viewData"}/${booking._id}`;

    // payment summary
    const successfulPayments = (booking.payments || [])?.filter(p => p.status === "success");

    const paymentsSummary = successfulPayments.length > 0
      ? successfulPayments.map(p => `₹${p.amount} via ${p.method}`).join('<br>')
      : "None yet";

    // ==========================================
    // 📩 EMAIL HTML — Confirmation Message Injected
    // ==========================================
    const fullMessage = `
      <div style="font-family: Arial; max-width:600px; margin:auto; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        
        <div style="background:#4CAF50; color:#fff; padding:16px; text-align:center; font-size:20px; font-weight:bold;">
          Booking Confirmation
        </div>

        <div style="padding:20px; background:#fafafa;">

          <pre style="white-space:pre-wrap; background:#f9f9f9; padding:15px; border-radius:6px; font-family:Verdana;">
${confirmationMessage}
          </pre>

          <div style="text-align:center; margin:25px 0;">
            <a href="${viewLink}" style="background:#2196F3; color:white; padding:12px 20px; text-decoration:none; border-radius:6px;">
              View Full Itinerary
            </a>
          </div>

        </div>

        <div style="background:#f1f1f1; text-align:center; padding:10px; font-size:12px; color:#666;">
          © ${softwardata.year} ${companyName}. All rights reserved.
        </div>

      </div>
      ${trackingPixel}
    `;

    // ==========================================
    // 📧 SEND EMAIL
    // ==========================================
    const mailOptions = {
      from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
      to: booking.clientDetails.email,
      bcc: booking.clientDetails.email2 || undefined,
      subject: `Booking Confirmation – ${packageName} | ${companyName}`,
      html: fullMessage,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", booking._id);

  } catch (err) {
    console.error("Error sending booking email:", err);
  }
};


// Separate function to send thank you email on booking completion
const sendThankYouEmail = async (booking) => {
  try {
    // Update or create email record for completion
    let emailRecord = await ItineraryEmail.findOne({ bookingId: booking._id || booking.bookingId || booking._id })

    if (emailRecord) {
      emailRecord.itineraryId = booking.selectedItinerary?._id
      emailRecord.clientDetails = {
        name: booking.clientDetails.name,
        email: booking.clientDetails.email,
        phone: booking.clientDetails.phone,
      }
      emailRecord.itinerarydata = booking
      emailRecord.status = "completed"
      emailRecord.isSeen = false
      emailRecord.sendCount = (emailRecord.sendCount || 0) + 1
      emailRecord.updatedAt = Date.now()

      await emailRecord.save()
      console.log("Existing email record updated for completion:", booking._id)
    } else {
      emailRecord = new ItineraryEmail({
        bookingId: booking._id || booking.bookingId || booking._id,
        itineraryId: booking.selectedItinerary?._id,
        clientDetails: {
          name: booking.clientDetails.name,
          email: booking.clientDetails.email,
          phone: booking.clientDetails.phone,
        },
        itinerarydata: booking,
        message: "Your booking has been completed. Thank you!",
        status: "completed",
        sendCount: 1,
      })

      await emailRecord.save()
      console.log("New email record created for completion:", booking._id)
    }

    const trackingPixel = `<img src="${serverBase}/api/emails/track/${emailRecord._id}" width="1" height="1" style="display:none;" />`
    const viewLink = `${clientBase}/${booking.theme?.link || ""}/${booking._id}`;

    // Fetch company data for review link
    const company = await Company.findOne();
    const footers = await TourSoftwareModel.findOne();
    const reviewLinkHtml = company && company.reviewLink ?
      `<div style="text-align:center; margin:25px 0; padding:15px; background:#e8f5e8; border-radius:6px;">
        <p style="margin:0; font-size:16px; color:#2e7d32;">Thank you for choosing us! We hope you had an amazing trip.</p>
        <p style="margin:5px 0 0 0; font-size:14px;">Help us improve by sharing your feedback:</p>
        <a href="${company.reviewLink}" style="background:#4CAF50; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px; display:inline-block; font-weight:bold;">⭐ Leave a Review</a>
      </div>` : '';

    const fullMessage = `
      <div style="font-family: Arial, sans-serif; color:#333; max-width:600px; margin:auto; border:1px solid #ddd; border-radius:8px; overflow:hidden; box-shadow:0 4px 8px rgba(0,0,0,0.05);">
        <div style="background:#FF9800; color:#fff; padding:16px; text-align:center; font-size:20px; font-weight:bold;">
          Booking Completed - Thank You!
        </div>
        <div style="padding:20px; background:#fafafa;">
          <p>Dear <b>${booking.clientDetails.name || "Guest"}</b>,</p>
          <p style="margin-bottom: 10px; font-style: italic;">
  "Khammaghani" 
</p>
          <p>Congratulations! Your booking has been successfully completed.</p>
          <table style="width:100%; border-collapse:collapse; margin:20px 0;">
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><b>Tour Code :</b></td>
              <td style="padding:8px; border:1px solid #ddd;">${booking.itineraryData.tourcode}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><b>Itinerary:</b></td>
              <td style="padding:8px; border:1px solid #ddd;">${booking.itineraryData?.titles?.[0] || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><b>Travel Date:</b></td>
              <td style="padding:8px; border:1px solid #ddd;">${booking.clientDetails?.travelDate || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><b>Total Amount:</b></td>
              <td style="padding:8px; border:1px solid #ddd;">${booking.totalAmount ?? "N/A"}</td>
            </tr>
          </table>
          <div style="text-align:center; margin:25px 0;">
            <a href="${viewLink}" style="background:#2196F3; color:#fff; padding:12px 20px; margin:5px; text-decoration:none; border-radius:6px; display:inline-block;">📄 View Itinerary</a>
          </div>
          ${reviewLinkHtml}
          <p style="font-size:14px; color:#666; text-align:center;">
            We look forward to serving you again soon!
          </p>
        </div>
        <div style="background:#f1f1f1; text-align:center; padding:10px; font-size:12px; color:#888;">
          © ${footers.year} ${footers.companyName}. All rights reserved.
        </div>
      </div>
      ${trackingPixel}
    `

    const mailOptions = {
      from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
      to: booking.clientDetails.email,
      bcc: booking.clientDetails.email2 || undefined,
      subject: "Booking Completed - Thank You!",
      html: fullMessage,
    }

    await transporter.sendMail(mailOptions)
    console.log("Thank you email sent successfully for booking:", booking._id)
  } catch (err) {
    console.error("Error sending thank you email:", err)
  }
}

async function sendOfferemail(booking, nextOfferData) {
  try {

    if (!booking.clientDetails?.email) return
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    let subject = "Your Booking Details"
    let htmlContent = `
      <h2>Booking Details</h2>
      <p>Booking ID: ${booking._id}</p>
      <p>Itinerary: ${booking.itineraryData?.titles?.[0] || "N/A"}</p>
      <p>Status: ${booking.status}</p>
    `

    if (nextOfferData) {
      const { type, value, used } = nextOfferData
      if (used === "used") {
        htmlContent += `<p>❌ Your next offer has been used.</p>`
        subject = "Next Offer Used"
      } else if (type && value > 0) {
        htmlContent += `<p>🎁 Next Offer: ${value}% (Active)</p>`
        subject = "Your Next Trip Offer!"
      } else {
        htmlContent += `<p>❌ No active offer available.</p>`
        subject = "Next Offer Status"
      }
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.clientDetails.email || undefined,
      bcc: booking.clientDetails.email2 || undefined,
      subject,
      html: htmlContent,
    })

    console.log("Email sent successfully to", booking.clientDetails.email)
  } catch (err) {
    console.error("Failed to send email:", err)
  }
}

// Upload screenshot endpoint
router.post("/upload-screenshot", upload.single("screenshot"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }
    const fileUrl = `${serverBase}/uploads/${req.file.filename}`
    res.status(200).json({ screenshotUrl: fileUrl })
  } catch (error) {
    console.error("Error uploading screenshot:", error)
    res.status(500).json({ message: "Failed to upload screenshot", error: error.message })
  }
})



// Generate next sequential booking ID (001, 002, 003...)
const getNextSequence = async (counterName) => {
  let counter = await Counter.findOne({ name: counterName });

  if (!counter) {
    counter = await Counter.create({ name: counterName, seq: 1 });
    return counter.seq.toString().padStart(3, "0");
  }

  counter.seq += 1;
  await counter.save();

  return counter.seq.toString().padStart(3, "0");
};


// ✅ NEW: Calculate final amount with festival offer
// ✅ FIXED: Festival Offer applies to BOTH totalAmount & bookingAmount
const calculateFinalAmountWithFestivalOffer = async (booking) => {
  console.log(booking, "offerbooking");

  try {
    // ✅ AUTO-DETECT CATEGORY
    const pricingObj = booking.itineraryData?.pricing || {};
    const rawCategory = Object.keys(pricingObj).find(
      (key) => Number(pricingObj[key]) > 0
    ) || "";

    // Normalize
    const normalized = rawCategory.trim().toLowerCase();

    // List of possible interpretations
    const possibleKeys = [
      normalized,
      normalized.replace(/\s+/g, " "),
      normalized.replace(/\b\w/g, (c) => c.toUpperCase()),
      rawCategory.trim(),
    ];

    // Find matching key in pricing
    const findKey = (obj) => {
      const lowerPossible = possibleKeys.map(k => k.toLowerCase());

      for (let key of Object.keys(obj)) {
        if (lowerPossible.includes(key.trim().toLowerCase())) {
          return key; // return exact original key from object
        }
      }
      return null;
    };


    const categoryKey = findKey(pricingObj);

    console.log(`👥 Category: ${categoryKey}`);

    const festivalOffer = booking.itineraryData?.festivalOffer || {};
    console.log(festivalOffer);

    const hasFestivalOffer = festivalOffer.selected && festivalOffer.value > 0;

    // ✅ FIXED AMOUNTS
    let categoryPrice = pricingObj[categoryKey] || 0;                     // e.g., 18000
    let categoryOffer = booking.itineraryData?.offers?.[categoryKey] || 0; // e.g., 50
    let bookingAmountFixed = booking.itineraryData?.bookingAmount || 0; // e.g., 500

    // ✅ TOTAL = Category Price - Category Offer
    let totalAmount = categoryPrice - categoryOffer;

    // ✅ APPLY FESTIVAL OFFER ON TOTAL ONLY
    if (hasFestivalOffer) {
      const festivalDiscountTotal = (totalAmount * festivalOffer.value) / 100;
      totalAmount -= festivalDiscountTotal;

      console.log(`🎉 Festival ${festivalOffer.value}% Applied on Total: ₹${festivalDiscountTotal.toFixed(0)}`);
    }

    // ✅ SET ALL FIELDS


    booking.totalAmount = totalAmount;          // Total after category + festival discounts
    booking.bookingAmount = bookingAmountFixed; // Keep booking amount unchanged
    booking.grandTotal = bookingAmountFixed;    // Keep grand total same as booking amount

    // ✅ ONLY SAVE FESTIVAL OFFER IF VALUE > 0
    booking.festivalOffer = hasFestivalOffer ? festivalOffer : null;

    await booking.save();

    console.log(`✅ FINAL (${categoryKey}):`);
    console.log(`✅ FINAL (${pricingObj}):`);
    console.log(`Total Package: ₹${totalAmount.toLocaleString()}`);
    console.log(`Booking Amount: ₹${bookingAmountFixed.toLocaleString()}`);
    console.log(`Grand Total: ₹${bookingAmountFixed.toLocaleString()}`);

    return booking;
  } catch (error) {
    console.error("Error calculating festival offer:", error);
    return booking;
  }
};

// ✅ HELPER: Extract first and last location from itinerary days
const getPickupAndDropoffLocations = (days) => {
  if (!days || days.length === 0) return { pickup: "", dropoff: "" };

  const pickupLocation = days[0]?.locations?.[0] || days[0]?.location || "";
  const lastDay = days[days.length - 1];
  const dropoffLocation = lastDay?.locations?.[0] || lastDay?.location || "";

  return { pickup: pickupLocation, dropoff: dropoffLocation };
};

// ✅ HELPER: Calculate trip end date
const calculateTripEndDate = (startDate, durationDays) => {
  const parsedDate = parseTravelDate(startDate);
  const endDate = new Date(parsedDate);
  endDate.setDate(endDate.getDate() + (durationDays - 1));

  const day = String(endDate.getDate()).padStart(2, '0');
  const month = String(endDate.getMonth() + 1).padStart(2, '0');
  const year = endDate.getFullYear();

  return `${day}-${month}-${year}`;
};

function formatToDMY(dateInput) {
  if (!dateInput) return "";

  // Already correct format --> return as-is
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
    return dateInput;
  }

  // Case: dd/mm/yyyy (or d/m/yyyy)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split("/");
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  // Case: dd.mm.yyyy
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split(".");
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  // Case: yyyy-mm-dd or anything parseable by Date()
  const parsedDate = new Date(dateInput);

  if (!isNaN(parsedDate)) {
    const d = String(parsedDate.getDate()).padStart(2, "0");
    const m = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const y = parsedDate.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // If no match, return original
  return dateInput;
}



// Create a new booking
// Create a new booking (Updated)
router.post("/", async (req, res) => {
  try {
    let bookingData = req.body;

    console.log(bookingData.clientDetails);


    // 🔥 Prevent reuse of old pending booking ID
    delete bookingData._id;
    if (bookingData.id) delete bookingData.id;


    // 🔥 Prevent duplicate booking within last 2 days (email OR phone)
    // const phone = bookingData.clientDetails?.phone?.trim();
    // const email = bookingData.clientDetails?.email?.trim()?.toLowerCase();

    // const twoDaysAgo = new Date();
    // twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // // 🔍 Build dynamic query
    // const query = {
    //   createdAt: { $gte: twoDaysAgo }
    // };

    // if (phone) query["clientDetails.phone"] = phone;
    // if (email) query["clientDetails.email"] = email;

    // // 🔥 If either phone OR email matches → block
    // if (phone || email) {
    //   const existing = await Booking.findOne(query);

    //   if (existing) {
    //     return res.status(400).json({
    //       success: false,
    //       message: "A booking with this phone or email already exists in last 2 days."
    //     });
    //   }
    // }



    // ✅ Check if phone already registered
    const phoneNumber = bookingData.clientDetails?.phone?.trim();
    // if (phoneNumber) {
    //   const existingClient = await Booking.findOne({
    //     "clientDetails.phone": phoneNumber
    //   });

    //   if (existingClient) {
    //     return res.status(400).json({
    //       success: false,
    //       message: `Client with phone number ${phoneNumber} is already registered.`
    //     });
    //   }
    // }

    // Fix travelDate before embedding
    if (bookingData.clientDetails?.travelDate) {
      bookingData.clientDetails.travelDate =
        formatToDMY(bookingData.clientDetails.travelDate);
    }


    console.log(bookingData.clientDetails?.travelDate, "bookingData.clientDetails?.travelDate");


    const updatedBookingData = await embedHotelData(bookingData);




    // ✅ HANDLE FESTIVAL OFFER - Preserve from pending booking
    if (
      bookingData.itineraryData?.festivalOffer &&
      bookingData.itineraryData.festivalOffer.value > 0
    ) {
      updatedBookingData.itineraryData.festivalOffer = bookingData.itineraryData.festivalOffer;
      updatedBookingData.itineraryData.festivalOffer.name = bookingData.itineraryData.festivalOffer.title || bookingData.itineraryData.festivalOffer.name;
    } else {
      updatedBookingData.itineraryData.festivalOffer = null;
    }


    // Set default theme if none selected
    if (!updatedBookingData.theme || !updatedBookingData.theme._id) {
      updatedBookingData.theme = {
        _id: "default",
        name: "Default Theme",
        link: "",
        imageUrl: "",
        isActive: true,
      };
    }


    // Fix tourcode
    if (updatedBookingData.itineraryData?.tourcode === undefined ||
      updatedBookingData.itineraryData?.tourcode === null ||
      updatedBookingData.itineraryData?.tourcode === "undefined") {
      updatedBookingData.itineraryData.tourcode = "";
    }
    if (updatedBookingData.selectedItinerary?.tourcode === undefined ||
      updatedBookingData.selectedItinerary?.tourcode === null ||
      updatedBookingData.selectedItinerary?.tourcode === "undefined") {
      updatedBookingData.selectedItinerary.tourcode = "";
    }

    updatedBookingData.contact = bookingData.contact;
    updatedBookingData.noteText = bookingData.noteText

    // ✅ AUTO-EXTRACT LOCATIONS FROM ITINERARY DAYS
    const { pickup, dropoff } = getPickupAndDropoffLocations(
      updatedBookingData.itineraryData?.days || []
    );

    // ✅ SET TRIP DATES (auto-populate pickup/dropoff locations)
    updatedBookingData.tripDates = {
      pickupDate: bookingData.clientDetails.travelDate,
      pickupLocation: pickup,  // Auto from Day 1
      tripEndDate: calculateTripEndDate(
        bookingData.clientDetails.travelDate,
        bookingData.itineraryData?.days?.length || 1
      ),
      dropoffLocation: dropoff,  // Auto from last day
    };

    // ✅ ADD DRIVER DETAILS (empty initially)
    updatedBookingData.driverDetails = {
      name: bookingData.driverDetails?.name || "",
      phone: bookingData.driverDetails?.phone || "",
    };


    const booking = new Booking(updatedBookingData);

    // Handle createby user
    let currentUser = req.body.createby;

    if (Array.isArray(currentUser)) {
      currentUser = currentUser[0];
    } else if (typeof currentUser === "string") {
      currentUser = { id: currentUser };
    }
    const nextId = await getNextSequence("bookingId");
    booking.bookingId = `RT${nextId}`;
    booking.createby = currentUser;
    booking.createdAt = new Date(),
      booking.inclusions = req.body.inclusions,
      booking.exclusions = req.body.exclusions,
      booking.termsAndConditions = req.body.termsAndConditions,
      booking.cancellationAndRefundPolicy = req.body.cancellationAndRefundPolicy,
      booking.travelRequirements = req.body.travelRequirements
    console.log(booking);

    const regularId = req.body.regularId;
    let successPayments = [];

    if (regularId) {
      const regularData = await pendingitineraray.findById(regularId);

      if (regularData) {
        successPayments = (regularData.payments || []).filter(
          (p) => p.status === "success"
        );
      }
    }
    booking.regularId = booking.regularId

    let data = await booking.save();

    // ⭐ STEP 3: Ab payments add karo
    if (successPayments && regularId) {
      await Booking.findByIdAndUpdate(
        booking._id,
        {
          $set: { status: "Booked" },
          $push: { payments: { $each: successPayments } }
        },
        { new: true }
      );


    }

    // ⭐ Update pending status
    if (regularId) {
      await pendingitineraray.findOneAndUpdate(
        { _id: regularId },
        { $set: { status: "created" } }
      );
    }
    const updatedBooking = await Booking.findById(booking._id);


    // ✅ CALCULATE FINAL AMOUNT WITH FESTIVAL OFFER
    await calculateFinalAmountWithFestivalOffer(booking);

    await sendBookingEmail(updatedBooking);

    if (booking.status === "Booked") {
      await ItineraryEmail.updateMany(
        { bookingId: booking._id || booking.bookingId || booking._id },
        { $set: { status: "Booked" } }
      );
    }


    res.status(201).json(booking);
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ message: "Failed to create booking", error: error.message });
  }
});

router.post("/:id/add-expense", async (req, res) => {
  try {
    const { title, amount, description } = req.body;

    if (!title || !amount) {
      return res.status(400).json({ message: "Title and Amount are required" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const newExpense = { title, amount, description };

    // Push new expense
    booking.expenses.push(newExpense);
    await booking.save();

    res.status(200).json({
      message: "Expense added successfully",
      expenses: booking.expenses,
    });
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ message: "Server Error", error });
  }
});

// Update booking (Updated)
router.put("/:id", async (req, res) => {
  try {
    let bookingData = req.body;

    // Fix travelDate
    if (bookingData.clientDetails?.travelDate) {
      const parsedDate = parseTravelDate(bookingData.clientDetails.travelDate);
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const year = parsedDate.getFullYear();
      bookingData.clientDetails.travelDate = `${day}-${month}-${year}`;
    }

    const updatedBookingData = await embedHotelData(bookingData);




    // ✅ HANDLE FESTIVAL OFFER - Preserve from request
    if (bookingData.itineraryData?.festivalOffer) {
      updatedBookingData.itineraryData.festivalOffer = bookingData.itineraryData.festivalOffer;
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Fix tourcode
    if (updatedBookingData.itineraryData?.tourcode === undefined ||
      updatedBookingData.itineraryData?.tourcode === null ||
      updatedBookingData.itineraryData?.tourcode === "undefined") {
      updatedBookingData.itineraryData.tourcode = "";
    }
    updatedBookingData.noteText = bookingData.noteText
    // ✅ UPDATE TRIP DATES (allow custom override or keep auto-extracted)
    updatedBookingData.tripDates = {
      pickupDate: bookingData.clientDetails.travelDate,
      pickupLocation: bookingData.tripDates?.pickupLocation || booking.tripDates?.pickupLocation || "",
      tripEndDate: calculateTripEndDate(
        bookingData.clientDetails.travelDate,
        bookingData.itineraryData?.days?.length || 1
      ),
      dropoffLocation: bookingData.tripDates?.dropoffLocation || booking.tripDates?.dropoffLocation || "",
    };

    // ✅ UPDATE DRIVER DETAILS (can add/modify driver later)
    updatedBookingData.driverDetails = {
      name: bookingData.driverDetails?.name !== undefined ? bookingData.driverDetails.name : (booking.driverDetails?.name || ""),
      phone: bookingData.driverDetails?.phone !== undefined ? bookingData.driverDetails.phone : (booking.driverDetails?.phone || ""),
    };

    console.log(updatedBookingData);

    updatedBookingData.inclusions = req.body.inclusions,
      updatedBookingData.exclusions = req.body.exclusions,
      updatedBookingData.termsAndConditions = req.body.termsAndConditions,
      updatedBookingData.cancellationAndRefundPolicy = req.body.cancellationAndRefundPolicy,
      updatedBookingData.travelRequirements = req.body.travelRequirements

    const { createby, ...rest } = updatedBookingData;
    delete updatedBookingData.createby;
    delete updatedBookingData.theme;  // Theme ko yahan delete karo, Object.assign se pehle!
    const { ...fieldsToUpdate } = updatedBookingData;

    // Baaki sab fields update karo
    Object.assign(booking, fieldsToUpdate);

    booking.theme = {
      _id: bookingData.theme?._id || booking.theme?._id || "default",
      name: bookingData.theme?.name || booking.theme?.name || "Default Theme",
      link: "viewData4",        // YE KABHI DELETE NAHI HOGA
      imageUrl: bookingData.theme?.imageUrl || booking.theme?.imageUrl || "",
      isActive: bookingData.theme?.isActive ?? booking.theme?.isActive ?? true
    };


    // ✅ ADD NEW PAYMENTS IF PROVIDED IN REQUEST BODY
    const newPayments = req.body.payments || [];
    if (newPayments.length > 0) {
      // Filter for successful payments only (optional: you can adjust to add all)
      const successfulNewPayments = newPayments.filter(p => p.status === 'success');
      if (successfulNewPayments.length > 0) {
        booking.payments.push(...successfulNewPayments);
        console.log(`Added ${successfulNewPayments.length} successful payments to booking`);
      }
    }

    booking.updatedAt = Date.now();
    updatedBookingData.addons = req.body.addons || [];

    updatedBookingData.approvel = false;

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id);


    // ✅ RECALCULATE FINAL AMOUNT WITH FESTIVAL OFFER
    await calculateFinalAmountWithFestivalOffer(booking);

    await sendBookingEmail(updatedBooking);
    await Booking.findByIdAndUpdate(
      booking._id,
      {
        $set: {
          ...rest,        // your updated fields
          approvel: false // <-- approvel ko yahin set karo
        },
        $inc: { updateCount: 1 }
      },
      { new: true, runValidators: true }
    );

    try {
      await updateSheetWithBookingChanges(updatedBooking);
      console.log('✅ Booking sheet updated with hotel changes');
    } catch (sheetError) {
      console.error('❌ Error updating sheet:', sheetError);
      // Don't fail the booking update if sheet update fails
    }

    if (booking.status === "Booked") {
      await ItineraryEmail.updateMany(
        { bookingId: booking._id || booking.bookingId || booking._id },
        { $set: { status: "Booked" } }
      );
    }

    console.log(booking);


    res.status(200).json(booking);
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ message: "Failed to update booking", error: error.message });
  }
});


router.put("/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Booking.findByIdAndUpdate(
      id,
      {
        $set: {
          approvel: true,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({
      message: "Booking Approved Successfully",
      data: updated,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error", error });
  }
});

// PUT /api/bookings/:id/driver
router.put("/:id/driver", async (req, res) => {
  try {
    const { driverDetails, vehicleSelection, tripDates, driverAdvance } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // 1. Driver Details
    if (driverDetails) {
      booking.driverDetails = { ...booking.driverDetails, ...driverDetails };
    }

    // 2. Vehicle Selection → itineraryData.vehicle
    if (vehicleSelection) {
      // Ensure itineraryData exists
      if (!booking.itineraryData) booking.itineraryData = {};
      if (!booking.itineraryData.vehicle) booking.itineraryData.vehicle = {};

      // Update vehicle fields
      booking.itineraryData.vehicle = {
        _id: vehicleSelection.vehicleId || booking.itineraryData.vehicle._id,
        number: vehicleSelection.vehicleNumber || booking.itineraryData.vehicle.number,
        type: vehicleSelection.vehicleType || booking.itineraryData.vehicle.type,
        model: vehicleSelection.vehicleModel || booking.itineraryData.vehicle.model,
        capacity: Number(vehicleSelection.capacity) || booking.itineraryData.vehicle.capacity || 0,
      };

      // Critical: Mark Mixed field as modified
      booking.markModified('itineraryData.vehicle');
      booking.markModified('itineraryData'); // Safe fallback
    }

    // 3. Trip Dates
    if (tripDates) {
      booking.tripDates = { ...booking.tripDates, ...tripDates };
      booking.markModified('tripDates');
    }

    // 4. Driver Advance
    if (driverAdvance) {
      booking.driverAdvance = { number: driverAdvance.number || 0 };
      booking.markModified('driverAdvance');
    }

    const saved = await booking.save();
    res.json({ success: true, booking: saved });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

router.post("/booked-completed", async (req, res) => {
  try {
    const user = req.body.user; // From auth middleware

    // Only ADMIN can access this
    if (!user || user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admin can view booked/completed bookings.",
        data: []
      });
    }

    // Admin → show all booked/completed bookings
    const query = {
      status: { $in: ["Booked", "Completed", "booked", "completed"] }
    };

    const bookings = await Booking.find(query).sort({ createdAt: -1 }).lean();

    const enrichedBookings = bookings.map(booking => {
      const successfulPayments = (booking.payments || []).filter(p => p.status === "success");
      const totalPaid = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const totalExpenses = (booking.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const profitLoss = totalPaid - totalExpenses;
      const profitLossStatus =
        profitLoss > 0 ? "Profit" : profitLoss < 0 ? "Loss" : "Break-even";

      return {
        ...booking,
        successfulPayments,
        totalPaid,
        totalExpenses,
        profitLoss,
        profitLossStatus
      };
    });

    res.status(200).json(enrichedBookings);

  } catch (error) {
    console.error("Error fetching booked/completed bookings:", error);
    res.status(500).json({ message: "Failed to fetch bookings", error: error.message });
  }
});


router.post("/export-excel", async (req, res) => {
  try {
    const { bookingIds } = req.body; // Array of IDs (e.g., ["id1"] for single, ["id1", "id2"] for multiple)
    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({ message: "bookingIds array is required" });
    }

    const bookings = await Booking.find({ _id: { $in: bookingIds } }).lean();

    if (bookings.length === 0) {
      return res.status(404).json({ message: "No bookings found" });
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Bookings Report");

    // Headers
    worksheet.columns = [
      { header: "Booking ID", key: "bookingId", width: 15 },
      { header: "Client Name", key: "clientName", width: 20 },
      { header: "Status", key: "status", width: 10 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Successful Payments", key: "successfulPayments", width: 20 },
      { header: "Total Paid", key: "totalPaid", width: 15 },
      { header: "Total Expenses", key: "totalExpenses", width: 15 },
      { header: "Profit/Loss", key: "profitLoss", width: 15 },
      { header: "Travel Date", key: "travelDate", width: 15 }
    ];

    console.log(bookings);

    // Add rows for each booking
    bookings.forEach(booking => {
      // FIXED: Calculate from actual payments array, not joined string
      const successfulPaymentsArray = (booking.payments || []).filter(p => p.status === "success");
      const successfulPayments = successfulPaymentsArray.map(p => `${p.amount} (${p.method})`).join(", ");
      console.log(successfulPayments);

      // FIXED: Use the array for reduce
      const totalPaid = successfulPaymentsArray.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Total expenses
      const totalExpenses = (booking.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const profitLoss = totalPaid - totalExpenses;

      worksheet.addRow({
        bookingId: booking.bookingId || booking._id,
        clientName: booking.clientDetails?.name || "N/A",
        status: booking.status,
        totalAmount: booking.totalAmount || 0,
        successfulPayments,
        totalPaid,
        totalExpenses,
        profitLoss: profitLoss > 0 ? `+₹${profitLoss}` : `₹${profitLoss}`,
        travelDate: booking.clientDetails?.travelDate || "N/A"
      });
    });

    // Set response headers for download
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=bookings-report-${Date.now()}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting Excel:", error);
    res.status(500).json({ message: "Failed to export Excel", error: error.message });
  }
});


router.get("/all-payments-admin", async (req, res) => {

  console.log("sdfsdsf");

  try {
    const bookings = await Booking.find({}, { payments: 1, _id: 1, clientDetails: 1 }).lean();

    console.log(bookings, "sdfsfsdf");


    const allPayments = bookings
      .flatMap(booking =>
        (booking.payments || []).map(payment => ({
          bookingId: booking._id.toString(),
          clientName: booking.clientDetails?.name || "N/A",
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          transactionId: payment.transactionId,
          gateway: payment.gateway,
          _id: payment._id,
          view: payment.view,
          paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
          receiptUrl: payment.receiptUrl || null,
          screenshot: payment.screenshot || null
        }))
      )
      // Sort by paymentDate descending (latest first)
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

    res.status(200).json(allPayments);
  } catch (error) {
    console.error("Error fetching all payments:", error);
    res.status(500).json({ message: "Failed to fetch all payments", error: error.message });
  }
});
// Get all bookings
router.get("/", async (req, res) => {
  try {
    let query = {};

    if (req.query.createdBy && mongoose.Types.ObjectId.isValid(req.query.createdBy)) {
      query["createby._id"] = (req.query.createdBy);
    }

    const bookings = await Booking.find(query).sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ message: "Failed to fetch bookings", error: error.message });
  }
});



// Get a single booking by ID
router.get("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }
    res.status(200).json(booking)
  } catch (error) {
    console.error("Error fetching booking:", error)
    res.status(500).json({ message: "Failed to fetch booking", error: error.message })
  }
})

// Update a booking
// router.put("/:id", async (req, res) => {
//   try {
//     let bookingData = req.body

//     // Fix travelDate before embedding
//     if (bookingData.clientDetails?.travelDate) {
//       // Assuming input might be YYYY-MM-DD or DD-MM-YYYY, parse and store as DD-MM-YYYY
//       const parsedDate = parseTravelDate(bookingData.clientDetails.travelDate);
//       const day = String(parsedDate.getDate()).padStart(2, '0');
//       const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
//       const year = parsedDate.getFullYear();
//       bookingData.clientDetails.travelDate = `${day}-${month}-${year}`;
//     } else {
//       const today = new Date();
//       const day = String(today.getDate()).padStart(2, "0");
//       const month = String(today.getMonth() + 1).padStart(2, "0");
//       const year = today.getFullYear();
//       bookingData.clientDetails.travelDate = `${day}-${month}-${year}`;
//     }

//     const updatedBookingData = await embedHotelData(bookingData)
//     console.log(updatedBookingData);

//     // Step 1: Fetch booking
//     const booking = await Booking.findById(req.params.id)
//     if (!booking) return res.status(404).json({ message: "Booking not found" })



//     // Step 2: Handle createby (keep old + new)
//     // if (!booking.createby || !Array.isArray(booking.createby)) {
//     //   booking.createby = []
//     // }

//     // const currentUser = req.body.createby // Frontend sends logged-in user

//     // if (currentUser) {
//     //   const exists = booking.createby.some((u) => u.email === currentUser.email)
//     //   if (!exists) {
//     //     booking.createby.push(currentUser)
//     //   }
//     // }


//     // Ensure itineraryData.tourcode is never 'undefined' or null
//     if (updatedBookingData.itineraryData && typeof updatedBookingData.itineraryData === "object") {
//       if (
//         updatedBookingData.itineraryData.tourcode === undefined ||
//         updatedBookingData.itineraryData.tourcode === null ||
//         updatedBookingData.itineraryData.tourcode === "undefined"
//       ) {
//         updatedBookingData.itineraryData.tourcode = "";
//       }
//     }


//     console.log(updatedBookingData);


//     // Step 3: Merge other booking fields (⚠ exclude createby so it doesn't overwrite)
//     const { createby, ...rest } = updatedBookingData
//     Object.assign(booking, rest)

//     booking.updatedAt = Date.now()

//     // Step 4: Save document
//     await booking.save()

//     // Step 5: Send email
//     await sendBookingEmail(booking)

//     // Step 6: Update email model if booked
//     if (booking.status === "Booked") {
//       await ItineraryEmail.updateMany({ bookingId: booking.bookingId || booking._id }, { $set: { status: "Booked" } })
//     }

//     res.status(200).json(booking)
//   } catch (error) {
//     console.error("Error updating booking:", error)
//     res.status(500).json({ message: "Failed to update booking", error: error.message })
//   }
// })

// Delete a booking
router.delete("/:id", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }
    res.status(200).json({ message: "Booking deleted successfully" })
  } catch (error) {
    console.error("Error deleting booking:", error)
    res.status(500).json({ message: "Failed to delete booking", error: error.message })
  }
})

// Get bookings by client email
router.get("/client/:email", async (req, res) => {
  try {
    const bookings = await Booking.find({ "clientDetails.email": req.params.email })
    res.status(200).json(bookings)
  } catch (error) {
    console.error("Error fetching bookings by email:", error)
    res.status(500).json({ message: "Failed to fetch bookings", error: error.message })
  }
})

// Endpoint to mark booking as completed and set initial nextOffer
router.put("/complete/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }

    // Calculate balance amount
    const paidAmount =
      booking.payments?.filter((p) => p.status === "success").reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const balanceAmount = booking.totalAmount - paidAmount

    // Check if booking is fully paid
    if (balanceAmount !== 0) {
      return res.status(400).json({ message: "Booking cannot be completed: Payment not fully cleared" })
    }

    // Check if status is "Booked"
    if (booking.status !== "Booked") {
      return res.status(400).json({ message: 'Booking must be in "Booked" status to mark as completed' })
    }

    // Calculate date difference
    const today = new Date()
    const travelDate = parseTravelDate(booking.clientDetails.travelDate)
    const durationDays =
      booking.itineraryData?.days?.length || Number.parseInt(booking.selectedItinerary?.duration) || 0
    const diffTime = today - travelDate
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < durationDays) {
      return res.status(400).json({
        message: "Booking cannot be completed: Travel date has not reached the itinerary duration",
      })
    }

    // Update booking status
    booking.status = "completed"
    booking.updatedAt = Date.now()

    // Set initial nextOffer if provided in request body, else default to { type: true, value: 0 }
    booking.nextOffer = req.body.nextOffer || { type: true, value: 0 }

    await booking.save()

    // Update associated email records
    await ItineraryEmail.updateMany({ bookingId: booking._id || booking.bookingId || booking._id }, { $set: { status: "completed" } })

    // Send completion email
    await sendThankYouEmail(booking)

    res.status(200).json({ message: "Booking marked as completed", booking })
  } catch (error) {
    console.error("Error marking booking as completed:", error)
    res.status(500).json({ message: "Failed to mark booking as completed", error: error.message })
  }
})

// New endpoint to update nextOffer for completed bookings
router.put("/update-offer/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: "Booking not found" })

    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Can only update nextOffer for completed bookings" })
    }

    const nextOfferFromFrontend = req.body.nextOffer || {}
    const { type, value } = nextOfferFromFrontend

    // Validate input
    if (typeof type !== "boolean" || typeof value !== "number") {
      return res.status(400).json({ message: "Invalid nextOffer data: type must be boolean, value must be number" })
    }

    // Check if nextOffer is already used
    if (booking.nextOffer.used === "used") {
      return res.status(400).json({ message: "Cannot update nextOffer: Offer has already been used" })
    }

    // Check if value is already set and prevent update
    if (booking.nextOffer.value > 0 && value !== booking.nextOffer.value) {
      return res.status(400).json({ message: "Cannot update nextOffer value: Value is already set" })
    }

    // Update nextOffer
    booking.nextOffer = { type, value, used: booking.nextOffer.used }
    booking.updatedAt = Date.now()
    await booking.save()

    // Send email with updated offer details
    await sendOfferemail(booking, nextOfferFromFrontend)

    res.status(200).json({ message: "Next offer updated successfully", booking })
  } catch (error) {
    console.error("Error updating next offer:", error)
    res.status(500).json({ message: "Failed to update next offer", error: error.message })
  }
})

router.put("/use-offer/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: "Booking not found" })

    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Can only mark offer as used for completed bookings" })
    }

    if (booking.nextOffer.used === "used") {
      return res.status(400).json({ message: "Offer has already been used" })
    }

    // Mark offer as used
    booking.nextOffer.used = "used"
    booking.updatedAt = Date.now()
    await booking.save()

    // Send email notification
    await sendOfferemail(booking, booking.nextOffer)

    res.status(200).json({ message: "Offer marked as used", booking })
  } catch (error) {
    console.error("Error marking offer as used:", error)
    res.status(500).json({ message: "Failed to mark offer as used", error: error.message })
  }
})


router.put("/cancel/:id", requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Already completed booking cannot be cancelled
    if (booking.status === "completed") {
      return res.status(400).json({
        message: "Booking is already completed and cannot be cancelled."
      });
    }

    // Already cancelled
    if (booking.status === "cancel") {
      return res.status(400).json({
        message: "Booking is already cancelled."
      });
    }

    // Cancel booking
    booking.status = "cancel";
    await booking.save();

    res.status(200).json({
      message: "Booking cancelled successfully.",
      booking
    });

  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({
      message: "Failed to cancel booking",
      error: error.message
    });
  }
});



router.put("/:bookingId/payments/:paymentId/view", async (req, res) => {
  try {
    const { view } = req.body; // Expect { view: "true" } or { view: "false" }
    if (!["true", "false"].includes(view)) {
      return res.status(400).json({ message: "view must be 'true' or 'false'" });
    }
    console.log(req.params);

    const paymentId = req.params.paymentId;
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ message: "Invalid payment ID" });
    }

    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const paymentIndex = booking.payments.findIndex(p => p._id.toString() === paymentId);
    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment not found" });
    }

    booking.payments[paymentIndex].view = view;
    booking.updatedAt = Date.now();
    await booking.save();

    res.status(200).json({ message: "Payment view updated successfully", booking });
  } catch (error) {
    console.error("Error updating payment view:", error);
    res.status(500).json({ message: "Failed to update payment view", error: error.message });
  }
});

// router.post("/:id/send-next-payment-email ", async (req, res) => {
//   try {
//     const booking = await Booking.findById(req.params.id);
//     if (!booking) {
//       return res.status(404).json({ message: "Booking not found" });
//     }
//     await sendBookingEmail(booking);
//     res.status(200).json({ message: "Test email sent successfully" });

//   } catch (error) {
//     console.error("Error sending test email:", error);
//     res.status(500).json({ message: "Failed to send test email", error: error.message });
//   }
// });


router.post("/:id/send-next-payment-email", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.clientDetails?.email) return

    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        message: "Missing required fields: to, subject, html",
      });
    }

    // Nodemailer transporter (example)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `Your Travel Team <${process.env.MAIL_USER}>`,
      to,
      bcc: booking.clientDetails?.email2 || undefined,
      subject,
      html,
    });

    res.status(200).json({ message: "Email sent successfully!" });

  } catch (error) {
    console.error("Error sending next payment email:", error);
    res.status(500).json({
      message: "Failed to send next payment email",
      error: error.message,
    });
  }
});




module.exports = router