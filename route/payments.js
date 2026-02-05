const express = require("express")
const router = express.Router()
const Booking = require("../model/Booking")
const ItineraryEmail = require("../model/email")
const Companybilldata = require("../model/Companybill")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const PDFDocument = require("pdfkit")
const mongoose = require("mongoose")
const JWT_SECRET = process.env.JWT_SECRET
const nodemailer = require("nodemailer")
const fs = require("fs")
const path = require("path")
const TourSoftwareModel = require("../model/TourSoftwareModel")

// Server and client base URLs
const serverBase = process.env.SERVER_BASE_URL || "https://apitour.rajasthantouring.in"
const clientBase = process.env.CLIENT_BASE_URL || "https://tour.rajasthantouring.in"

// IMPORTANT: To fix the rupee symbol (₹) rendering issue in PDFs, download Noto Sans fonts from Google Fonts:
// - NotoSans-Regular.ttf
// - NotoSans-Bold.ttf
// Place them in a 'fonts' folder in your project root (e.g., project-root/fonts/).
// These fonts support the Indian Rupee symbol (U+20B9).
const fontsDir = path.join(__dirname, "..", "fonts")
const regularFontPath = path.join(fontsDir, "NotoSans-Regular.ttf")
const boldFontPath = path.join(fontsDir, "NotoSans-Bold.ttf")

// sendPaymentEmail.js



const sendPaymentEmailadmin = async ({ adminEmail, bookingDetails, clientDetails, paymentDetails }) => {
  const softwardata = await TourSoftwareModel.find();

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
        pass: process.env.EMAIL_PASS || "bhsh nipi oory ayop",
      },
    });

    const amount = Number(paymentDetails.amount || 0);
    const tourCode = bookingDetails.itineraryData?.tourcode;
    const packageName = bookingDetails.itineraryData?.titles?.[0] || "N/A";

    const htmlContent = `
<div style="font-family: Arial, sans-serif; max-width:650px; margin:auto; padding:20px; background:#fff; border:1px solid #ddd;">

  <h2 style="margin-bottom:15px; text-align:center; color:#222;">
      New Payment Received
  </h2>

  <table style="width:100%; border-collapse: collapse; font-size:14px; color:#333;">
    
    <tr>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Client Name</td>
      <td style="padding:8px; border:1px solid #ddd;">${clientDetails.name} </td>
    </tr>

    <tr>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Phone</td>
      <td style="padding:8px; border:1px solid #ddd;">${clientDetails.phone}</td>
    </tr>

    <tr>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Package</td>
      <td style="padding:8px; border:1px solid #ddd;">${packageName}</td>
    </tr>

    <tr style="background:#f5f5f5;">
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Amount</td>
      <td style="padding:8px; border:1px solid #ddd; font-size:16px;">₹${amount} ${paymentDetails.currency || "INR"}</td>
    </tr>

   

    ${paymentDetails.mobileNumber ? `
    <tr>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">UPI Mobile</td>
      <td style="padding:8px; border:1px solid #ddd;">${paymentDetails.mobileNumber}</td>
    </tr>
    ` : ""}

   ${(paymentDetails.method || paymentDetails.gateway) ? `
<tr>
  <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">
    ${paymentDetails.method && paymentDetails.gateway
          ? "Method / Gateway"
          : paymentDetails.method
            ? "Method"
            : "Gateway"
        }
  </td>

  <td style="padding:8px; border:1px solid #ddd;">
    ${paymentDetails.method && paymentDetails.gateway
          ? `${paymentDetails.method} / ${paymentDetails.gateway}`
          : paymentDetails.method
            ? paymentDetails.method
            : paymentDetails.gateway
        }
  </td>
</tr>
` : ""}

${paymentDetails.transactionId ? `
<tr>
  <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Transaction ID</td>
  <td style="padding:8px; border:1px solid #ddd;">${paymentDetails.transactionId}</td>
</tr>
` : ""}

${paymentDetails.paymentDate ? `
<tr>
  <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Date</td>
  <td style="padding:8px; border:1px solid #ddd;">
    ${new Date(paymentDetails.paymentDate).toLocaleString()}
  </td>
</tr>
` : ""}

    ${paymentDetails.screenshot ? `
    <tr>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Screenshot</td>
      <td style="padding:8px; border:1px solid #ddd;">
        <a href="${paymentDetails.screenshot}" style="color:#1a73e8;">View Screenshot</a>
      </td>
    </tr>
    ` : ""}
  </table>

  <p style="text-align:center; font-size:12px; color:#777; margin-top:20px;">
    © ${softwardata[0].year} ${softwardata[0].companyName}. All rights reserved.
  </p>

</div>
`;

    await transporter.sendMail({
      from: `${softwardata[0].companyName}`,
      to: adminEmail,
      subject: `New Payment Received – ${packageName}`,
      html: htmlContent,
    });

    console.log("Simple Table-Based Admin Email Sent!");
  } catch (err) {
    console.error("Failed to send admin email:", err);
  }
};




const formatDateFromDDMMYYYY = (dateStr) => {
  if (!dateStr) return "TBC";
  const [day, month, year] = dateStr.split("-");
  if (!day || !month || !year) return "TBC";

  const date = new Date(`${year}-${month}-${day}`);
  if (isNaN(date.getTime())) return "TBC";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Calculate End Date from itinerary days length
const calculateEndDate = (startDateStr, totalDays) => {
  if (!startDateStr || !totalDays) return "TBC";
  const [day, month, year] = startDateStr.split("-");
  const startDate = new Date(`${year}-${month}-${day}`);
  if (isNaN(startDate.getTime())) return "TBC";

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + (totalDays - 1)); // -1 because Day 1 is included

  return endDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Helper to calculate total paid amount (supports single or category-wise)
const calculateTotalPaid = (payments) => {
  return (payments || [])
    .filter(p => p.status === "success")
    .reduce((sum, p) => {
      if (typeof p.amount === "object" && p.amount !== null) {
        return sum + Object.values(p.amount).reduce((catSum, val) => catSum + Number(val || 0), 0);
      }
      return sum + Number(p.amount || 0);
    }, 0);
};

const generatePaymentPDF = async (booking, payment, action) => {
  const company = await Companybilldata.findOne()
  const footers = await TourSoftwareModel.findOne()

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" })
    const buffers = []

    doc.on("data", buffers.push.bind(buffers))
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)

    // Register custom fonts
    let useCustomFont = false
    if (fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath)) {
      doc.registerFont("CustomRegular", regularFontPath)
      doc.registerFont("CustomBold", boldFontPath)
      useCustomFont = true
    }

    // Helper functions for fonts
    const setBoldFont = (size = 12) => {
      if (useCustomFont) {
        doc.font("CustomBold").fontSize(size)
      } else {
        doc.font("Helvetica-Bold").fontSize(size)
      }
    }

    const setRegularFont = (size = 12) => {
      if (useCustomFont) {
        doc.font("CustomRegular").fontSize(size)
      } else {
        doc.font("Helvetica").fontSize(size)
      }
    }
    const currencySymbol = useCustomFont ? "₹" : "Rs."

    // Header Background
    doc.rect(40, 30, 515, 80).fill("#0D47A1");

    // Payment Title
    setBoldFont(28);
    doc.fillColor("white").text("PAYMENT CONFIRMATION", 50, 55, {
      align: "center",
      width: 495
    });

    // Invoice Date
    setRegularFont(12);
    const invoiceDate = new Date().toLocaleDateString("en-GB");
    doc.text(`Invoice Date: ${invoiceDate}`, 50, 90, {
      align: "center",
      width: 495
    });

    // Logo – Perfect aligned
    if (company?.companyLogo) {
      try {
        const logoFile = company.companyLogo.split("/").pop();
        const logoPath = path.join(__dirname, "../uploads", logoFile);

        doc.image(logoPath, 500, 40, { width: 55, height: 55 });
        //     X    Y
        // X=500 → right side but inside blue box
        // Y=40 → vertical center of 30–110 box
      } catch (err) {
        console.error("Logo error:", err);
      }
    }

    y = 130;


    // ========== COMPANY & CLIENT DETAILS ==========
    // Company Details Box - Light green background
    doc.rect(40, y, 250, 100).fill("#F1F8E9")

    setBoldFont(16)
    doc.fillColor("#2E7D32").text("COMPANY DETAILS", 50, y + 15)

    setRegularFont(10)
    doc.fillColor("#333")
    if (company) {
      doc.text(company.companyName || "N/A", 50, y + 35)
      doc.text(`GSTIN: ${company.companyGST || "N/A"}`, 50, y + 50)
      doc.text(`Email: ${company.companyEmail || "N/A"}`, 50, y + 65)
      doc.text(`Phone: ${company.companyPhone || "N/A"}`, 50, y + 80)
    }

    // Client Details Box - Light blue background
    doc.rect(305, y, 250, 100).fill("#E8F4FD")

    setBoldFont(16)
    doc.fillColor("#1565C0").text("CLIENT DETAILS", 315, y + 15)

    setRegularFont(10)
    doc.fillColor("#333")
    doc.text(booking.clientDetails.name || "N/A", 315, y + 35)
    doc.text(booking.clientDetails.email || "N/A", 315, y + 50)
    doc.text(`Phone: ${booking.clientDetails.phone || "N/A"}`, 315, y + 65)
    doc.text(`Travel Date: ${booking.clientDetails.travelDate || "N/A"}`, 315, y + 80)

    y += 120

    // ========== TOUR DETAILS & LATEST PAYMENT TABLE ==========
    setBoldFont(18)
    doc.fillColor("#0D47A1").text("TOUR & PAYMENT DETAILS", 50, y)
    y += 25

    // Table Header with border
    doc.rect(40, y, 515, 25).fill("#E3F2FD")
    doc.rect(40, y, 515, 25).stroke("#BBDEFB")
    setBoldFont(11)
    doc.fillColor("#0D47A1")
    doc.text("Field", 50, y + 9)
    doc.text("Details", 250, y + 9)
    y += 30

    // Tour Details Rows with borders - FIXED FOR LONG TEXT
    const tourDetails = [
      { field: "Tour Code", value: booking.itineraryData?.tourcode || "N/A" },
      { field: "Package", value: booking.itineraryData?.titles?.[0] || "N/A" },
      { field: "Duration", value: `${booking.itineraryData?.days?.length || 0} Days` }
    ]

    setRegularFont(10)
    tourDetails.forEach((item, index) => {
      // Calculate text height for wrapping
      const textOptions = { width: 280, align: "left" }
      const textHeight = doc.heightOfString(item.value, textOptions)
      const rowHeight = Math.max(20, textHeight + 6)

      doc.rect(40, y, 515, rowHeight).fill(index % 2 === 0 ? "#FAFAFA" : "#FFFFFF")
      doc.rect(40, y, 515, rowHeight).stroke("#E0E0E0")

      doc.fillColor("#333")
      doc.text(item.field, 50, y + 6)
      doc.text(item.value, 250, y + 6, textOptions)
      y += rowHeight + 2
    })

    y += 10

    // Latest Payment Rows with borders
    // MODIFIED: Changed Transaction ID to Screenshot Link
    const screenshotUrl = payment?.screenshot || payment?.receiptUrl;
    const latestPaymentDetails = [
      { field: "Amount", value: `${currencySymbol}${Number(payment?.amount || 0)}` },
      { field: "Status", value: payment?.status || "N/A" },
      { field: "Method", value: payment?.method || "N/A" },
      ...(payment?.mobileNumber ? [{ field: "Mobile Number", value: payment.mobileNumber }] : []),
      {
        field: "Screenshot",
        value: screenshotUrl ? "View Receipt" : "N/A",
        link: screenshotUrl || null
      },
      { field: "Date", value: payment?.paymentDate ? new Date(payment.paymentDate).toLocaleDateString("en-GB") : "N/A" }
    ]

    latestPaymentDetails.forEach((item, index) => {
      doc.rect(40, y, 515, 20).fill(index % 2 === 0 ? "#FAFAFA" : "#FFFFFF")
      doc.rect(40, y, 515, 20).stroke("#E0E0E0")

      doc.fillColor("#333")
      doc.text(item.field, 50, y + 6)

      // Render value as clickable link if link property exists
      if (item.link) {
        doc.fillColor("blue")
        doc.text(item.value, 250, y + 6, { width: 290, link: item.link, underline: true })
      } else {
        doc.text(item.value, 250, y + 6, { width: 290 })
      }

      y += 22
    })

    y += 30

    // ========== PAYMENT HISTORY ==========
    const allPayments = booking.payments || []
    const totalPaid = allPayments
      .filter((p) => p.status === "success")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const remaining = (booking.totalAmount || 0) - totalPaid

    setBoldFont(18)
    doc.fillColor("#0D47A1").text("PAYMENT HISTORY", 50, y)
    y += 25

    // ========== ENHANCED PAYMENT HISTORY TABLE ==========
    setRegularFont(8)

    // Column widths and positions
    // MODIFIED: Renamed txnId column logic to display Screenshot
    const columns = {
      date: { x: 45, width: 65 },
      amount: { x: 112, width: 55 },
      status: { x: 170, width: 50 },
      method: { x: 223, width: 50 },
      gateway: { x: 276, width: 100 },
      txnId: { x: 379, width: 165 } // Used for Screenshot
    }

    // Table Header
    doc.rect(40, y, 515, 28).fill("#0D47A1")
    setBoldFont(10)
    doc.fillColor("white")
    doc.text("Date", columns.date.x, y + 10, { width: columns.date.width, align: "center" })
    doc.text("Amount", columns.amount.x, y + 10, { width: columns.amount.width, align: "center" })
    doc.text("Status", columns.status.x, y + 10, { width: columns.status.width, align: "center" })
    doc.text("Method", columns.method.x, y + 10, { width: columns.method.width, align: "center" })
    doc.text("Gateway", columns.gateway.x, y + 10, { width: columns.gateway.width, align: "center" })
    // MODIFIED: Header text
    doc.text("Screenshot", columns.txnId.x, y + 10, { width: columns.txnId.width, align: "center" })

    y += 32

    // Payment rows
    setRegularFont(8)
    allPayments.forEach((p, index) => {
      // Page break check
      if (y > 720) {
        doc.addPage()
        y = 40

        // Recreate header on new page
        setBoldFont(18)
        doc.fillColor("#0D47A1").text("PAYMENT HISTORY (Continued)", 50, y)
        y += 25

        doc.rect(40, y, 515, 28).fill("#0D47A1")
        setBoldFont(10)
        doc.fillColor("white")
        doc.text("Date", columns.date.x, y + 10, { width: columns.date.width, align: "center" })
        doc.text("Amount", columns.amount.x, y + 10, { width: columns.amount.width, align: "center" })
        doc.text("Status", columns.status.x, y + 10, { width: columns.status.width, align: "center" })
        doc.text("Method", columns.method.x, y + 10, { width: columns.method.width, align: "center" })
        doc.text("Gateway", columns.gateway.x, y + 10, { width: columns.gateway.width, align: "center" })
        doc.text("Screenshot", columns.txnId.x, y + 10, { width: columns.txnId.width, align: "center" })

        y += 32
      }

      // Alternating row colors
      const bgColor = index % 2 === 0 ? "#F5F5F5" : "#FFFFFF"
      doc.rect(40, y, 515, 24).fill(bgColor)
      doc.rect(40, y, 515, 24).stroke("#D0D0D0")

      // Row data
      doc.fillColor("#333")
      setRegularFont(8)

      const dateStr = new Date(p.paymentDate).toLocaleDateString("en-GB")
      const amountStr = `${currencySymbol}${Number(p.amount || 0)}`
      const statusStr = p.status || "N/A"
      const methodStr = p.method || "N/A"
      const gatewayStr = p.gateway || "N/A"

      // MODIFIED: Screenshot Link Logic
      const screenshotLink = p.receiptUrl || p.screenshot || null;
      const screenshotText = screenshotLink ? "View" : "N/A";

      doc.text(dateStr, columns.date.x, y + 7, { width: columns.date.width, align: "center" })
      doc.text(amountStr, columns.amount.x, y + 7, { width: columns.amount.width, align: "center" })

      // Status with color
      if (statusStr === "success") {
        doc.fillColor("#2E7D32")
      } else if (statusStr === "failed") {
        doc.fillColor("#C62828")
      } else {
        doc.fillColor("#333")
      }
      doc.text(statusStr, columns.status.x, y + 7, { width: columns.status.width, align: "center" })

      doc.fillColor("#333")
      doc.text(methodStr, columns.method.x, y + 7, { width: columns.method.width, align: "center" })
      doc.text(gatewayStr, columns.gateway.x, y + 7, { width: columns.gateway.width, align: "center" })

      // Render clickable link for screenshot
      if (screenshotLink) {
        doc.fillColor("blue")
        doc.text(screenshotText, columns.txnId.x, y + 7, {
          width: columns.txnId.width,
          align: "center",
          link: screenshotLink,
          underline: true
        })
      } else {
        doc.fillColor("#333")
        doc.text(screenshotText, columns.txnId.x, y + 7, {
          width: columns.txnId.width,
          align: "center"
        })
      }

      y += 26
    })

    y += 20

    // ========== PAYMENT SUMMARY ==========
    doc.rect(40, y, 515, 100).fill("#F1F8E9")
    doc.rect(40, y, 515, 100).stroke("#B8E6B8")

    setBoldFont(18)
    doc.fillColor("#2E7D32").text("PAYMENT SUMMARY", 50, y + 15)

    setRegularFont(12)
    doc.fillColor("#333")
    doc.text(`Total Package Amount: ${currencySymbol}${booking.totalAmount || 0}`, 50, y + 40)
    doc.text(`Total Paid Amount: ${currencySymbol}${totalPaid}`, 50, y + 60)
    doc.text(`Remaining Amount: ${currencySymbol}${remaining}`, 50, y + 80)

    // Payment Status Badge
    let statusText = ""
    let statusColor = ""
    let statusBg = ""

    if (remaining === 0) {
      statusText = "✓ FULLY PAID"
      statusColor = "#FFFFFF"
      statusBg = "#2E7D32"
    } else if (totalPaid > 0) {
      statusText = "  PARTIALLY PAID"
      statusColor = "#FFFFFF"
      statusBg = "#FF9800"
    } else {
      statusText = "  PENDING"
      statusColor = "#FFFFFF"
      statusBg = "#F44336"
    }

    doc.rect(300, y + 35, 215, 35).fill(statusBg)
    setBoldFont(13)
    doc.fillColor(statusColor).text(statusText, 310, y + 48, { width: 195, align: "center" })

    y += 120

    // ========== FOOTER ==========
    doc.rect(40, y, 515, 50).fill("#F5F5F5")
    doc.rect(40, y, 515, 50).stroke("#E0E0E0")

    setRegularFont(10)
    doc.fillColor("#666")
    doc.text("Thank you for choosing our services. We look forward to serving you!", 50, y + 10, { align: "center", width: 495 })

    setRegularFont(9)
    doc.fillColor("#999")
    doc.text(`© ${new Date().getFullYear()} ${footers?.companyName || company?.companyName || "Your Company"}. All rights reserved.`, 50, y + 35, { align: "center", width: 495 })

    doc.end()
  })
}

// ==================== 20% CONFIRMATION EMAIL ====================
const send20PercentConfirmationEmail = async (pending) => {
  try {
    const clientEmail = pending.clientDetails?.email;
    const clientName = pending.clientDetails?.name || "Valued Guest";

    const startDateRaw = pending.clientDetails?.travelDate;
    const totalItineraryDays = pending.itineraryData?.days?.length || 0;

    const startDate = formatDateFromDDMMYYYY(startDateRaw);
    const endDate = totalItineraryDays > 0
      ? calculateEndDate(startDateRaw, totalItineraryDays)
      : "TBC";

    const tourName = pending.selectedItinerary?.titles?.[0] ||
      pending.packageName ||
      "Custom Rajasthan Tour Package";

    if (!clientEmail) {
      console.log("No client email found, skipping 20% confirmation email");
      return;
    }

    // Find the first successful payment for breakdown
    const firstSuccessPayment = (pending.payments || []).find(p => p.status === "success");

    if (!firstSuccessPayment) {
      console.log("No successful payment found for 20%.");
      return;
    }

    // Extract amount properly (supports both single number and category-wise object)
    let receivedAmount = 0;
    let amountBreakdown = "";

    if (typeof firstSuccessPayment.amount === "object" && firstSuccessPayment.amount !== null) {
      // Multi-category amount (e.g., { hotel: 8000, cab: 2000 })
      receivedAmount = Object.values(firstSuccessPayment.amount).reduce((sum, val) => sum + Number(val || 0), 0);
      amountBreakdown = Object.entries(firstSuccessPayment.amount)
        .map(([cat, amt]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ₹${Number(amt || 0).toLocaleString('en-IN')}`)
        .join(" + ");
    } else {
      // Single amount
      receivedAmount = Number(firstSuccessPayment.amount || 0);
    }

    const formattedAmount = receivedAmount.toLocaleString('en-IN');
    const displayAmount = amountBreakdown ? `${amountBreakdown} = ₹${formattedAmount}` : `₹${formattedAmount}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
      to: clientEmail,
      bcc: pending.clientDetails.email2 || undefined,
      subject: "Your Rajasthan Trip Booking is Confirmed!",
      html: `
        <div style="font-family: Verdana; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #fff;">
          <h2 style="color: #d4af37; text-align: center;">Rajasthan Touring</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p style="margin-bottom: 20px; font-style: italic;">
  "Khammaghani" 
</p>
          <p>Thank you for choosing Rajasthan Touring! We’re delighted to inform you that your Rajasthan Trip booking is now <strong>confirmed</strong>.</p>
          
          <p>We have successfully received your advance payment of:</p>
          <h2 style="color: green; text-align: center;">${displayAmount}</h2>

          ${amountBreakdown ? `<p><strong>Breakdown:</strong> ${amountBreakdown.replace(/ \+ /g, ' + ')}</p>` : ''}

          <h3>Booking Summary</h3>
          <ul>
           <li><strong>Tour Package:</strong> ${tourName}</li>
<li><strong>Travel Dates:</strong> ${startDate} – ${endDate}</li>
<li><strong>Guest Name:</strong> ${clientName}</li>
<li>
  <strong>Total Guests:</strong>
  ${pending.clientDetails?.travelers || pending.clientDetails?.adults}

  ${pending.clientDetails?.adults ? `(Adults: ${pending.clientDetails.adults}` : ''}

  ${pending.clientDetails?.kids5to12 ? `, Kids 5-12: ${pending.clientDetails.kids5to12}` : ''}

  ${pending.clientDetails?.kidsBelow5 ? `, Below 5: ${pending.clientDetails.kidsBelow5}` : ''}

  ${pending.clientDetails?.adults || pending.clientDetails?.kids5to12 || pending.clientDetails?.kidsBelow5 ? ')' : ''}
</li>
         </ul>

          <h3>Payment Terms</h3>
          <ul>
            <li>20% – Advance Payment – <strong style="color: green;">Received ✓</strong> (${displayAmount})</li>
            <li>30% – Payable at the time of Hotel Confirmation & Voucher Issuance</li>
            <li>50% – Payable Upon Arrival on Day 1 (In Cash)</li>
          </ul>

          <p>Your hotels, cab, and itinerary are now being finalized. Vouchers will be shared within 24-48 hours.</p>

          <p>We’re super excited to host you in the royal land of Rajasthan!</p>

          <p>For any queries, feel free to call/WhatsApp us at <strong>+91 9509911614</strong>.</p>

          <br>
          <p>Warm Regards,<br>
          <strong>Team Rajasthan Touring</strong><br>
          Jaipur, Rajasthan</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`20% Confirmation email sent to ${clientEmail} | Amount: ₹${formattedAmount}`);
  } catch (err) {
    console.error("Failed to send 20% confirmation email:", err);
  }
};

// ==================== 30% VOUCHER CONFIRMATION EMAIL ====================
const send30PercentConfirmationEmail = async (pending, payment, action) => {
  try {
    const clientEmail = pending.clientDetails?.email;
    const clientName = pending.clientDetails?.name || "Valued Guest";

    const startDateRaw = pending.clientDetails?.travelDate;
    const totalItineraryDays = pending.itineraryData?.days?.length || 0;

    const startDate = formatDateFromDDMMYYYY(startDateRaw);
    const endDate = totalItineraryDays > 0
      ? calculateEndDate(startDateRaw, totalItineraryDays)
      : "TBC";

    const tourName = pending.selectedItinerary?.titles?.[0] ||
      pending.packageName ||
      "Custom Rajasthan Tour Package";

    const bookingId = pending.bookingId || pending._id.slice(-5).toUpperCase();

    const software = await TourSoftwareModel.find()


    if (!clientEmail) {
      console.log("No client email found, skipping 30% confirmation email");
      return;
    }

    // Find the latest successful payment for 30% breakdown
    const successPayments = (pending.payments || []).filter(p => p.status === "success");
    const latest30Payment = successPayments[successPayments.length - 1]; // Assuming last is 30%

    if (!latest30Payment) {
      console.log("No successful payment found for 30%.");
      return;
    }

    // Extract amount properly
    let receivedAmount30 = 0;
    let amountBreakdown30 = "";

    if (typeof latest30Payment.amount === "object" && latest30Payment.amount !== null) {
      receivedAmount30 = Object.values(latest30Payment.amount).reduce((sum, val) => sum + Number(val || 0), 0);
      amountBreakdown30 = Object.entries(latest30Payment.amount)
        .map(([cat, amt]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ₹${Number(amt || 0).toLocaleString('en-IN')}`)
        .join(" + ");
    } else {
      receivedAmount30 = Number(latest30Payment.amount || 0);
    }

    const formattedAmount30 = receivedAmount30.toLocaleString('en-IN');
    const displayAmount30 = amountBreakdown30 ? `${amountBreakdown30} = ₹${formattedAmount30}` : `₹${formattedAmount30}`;
    const pdfBuffer = await generatePaymentPDF(pending, payment, action)

    const mailOptions = {
      from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
      to: clientEmail,
      bcc: pending.clientDetails.email2 || undefined,
      subject: "30% Voucher Payment Received - Booking Updated!",
      html: `
        <div style="font-family: Verdana; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #fff;">
          <h2 style="color: #d4af37; text-align: center;">${software.companyName}</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p style="margin-bottom: 20px; font-style: italic;">
  "Khammaghani" 
</p>
          <p>We’re happy to confirm that we have received your 30% voucher payment.</p>
          
          <p>Your booking is now fully updated in our system.</p>

          <p>We have successfully received your voucher payment of:</p>
          <h2 style="color: green; text-align: center;">${displayAmount30}</h2>

          ${amountBreakdown30 ? `<p><strong>Breakdown:</strong> ${amountBreakdown30.replace(/ \+ /g, ' + ')}</p>` : ''}

          <h3>Booking Summary</h3>
          <ul>
           <li><strong>Confirmation No.:</strong> ${bookingId}</li>
           <li><strong>Tour Package:</strong> ${tourName}</li>
<li><strong>Travel Dates:</strong> ${startDate} – ${endDate}</li>
<li><strong>Guest Name:</strong> ${clientName}</li>
<li>
  <strong>Total Guests:</strong>
  ${pending.clientDetails?.travelers || pending.clientDetails?.adults}

  ${pending.clientDetails?.adults ? `(Adults: ${pending.clientDetails.adults}` : ''}

  ${pending.clientDetails?.kids5to12 ? `, Kids 5-12: ${pending.clientDetails.kids5to12}` : ''}

  ${pending.clientDetails?.kidsBelow5 ? `, Below 5: ${pending.clientDetails.kidsBelow5}` : ''}

  ${pending.clientDetails?.adults || pending.clientDetails?.kids5to12 || pending.clientDetails?.kidsBelow5 ? ')' : ''}
</li>
         </ul>

          <h3>Payment Status</h3>
          <ul>
            <li>20% – Advance <strong style="color: green;">(Received)</strong></li>
            <li>30% – Voucher Payment <strong style="color: green;">(Received)</strong></li>
            <li>50% – Due on Arrival (Day 1, in cash)</li>
          </ul>

          <p>Thank you for your prompt payment. Please feel free to contact us if you need any assistance.</p>

          <p>For any queries, feel free to call/WhatsApp us at <strong>${pending.contact?.mobiles[0]}</strong>.</p>

          <br>
          <p>Warm Regards,<br>
          <strong>${pending.contact?.name}<br>
          Jaipur, Rajasthan</p>
        </div>
      `,
      attachments: [
        {
          filename: `Payment_Confirmation_${pending._id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`30% Confirmation email sent to ${clientEmail} | Amount: ₹${formattedAmount30}`);
  } catch (err) {
    console.error("Failed to send 30% confirmation email:", err);
  }
};

// ====================  50% VOUCHER CONFIRMATION EMAil ====================
const send50PercentConfirmationEmail = async (pending, payment, action) => {
  try {
    const clientEmail = pending.clientDetails?.email;
    const clientName = pending.clientDetails?.name || "Valued Guest";

    const startDateRaw = pending.clientDetails?.travelDate;
    const totalItineraryDays = pending.itineraryData?.days?.length || 0;

    const startDate = formatDateFromDDMMYYYY(startDateRaw);
    const endDate = totalItineraryDays > 0
      ? calculateEndDate(startDateRaw, totalItineraryDays)
      : "TBC";

    const tourName = pending.selectedItinerary?.titles?.[0] ||
      pending.packageName ||
      "Custom Rajasthan Tour Package";

    const bookingId = pending.bookingId || pending._id.slice(-5).toUpperCase();

    const software = await TourSoftwareModel.findOne();

    if (!clientEmail) {
      console.log("No client email found, skipping 50% confirmation email");
      return;
    }

    // Get the latest successful payment (assumed to be the 50% final payment)
    const successPayments = (pending.payments || []).filter(p => p.status === "success");
    const latest50Payment = successPayments[successPayments.length - 1];

    if (!latest50Payment) {
      console.log("No successful payment found for 50%.");
      return;
    }

    let receivedAmount50 = 0;
    let amountBreakdown50 = "";

    if (typeof latest50Payment.amount === "object" && latest50Payment.amount !== null) {
      receivedAmount50 = Object.values(latest50Payment.amount).reduce((sum, val) => sum + Number(val || 0), 0);
      amountBreakdown50 = Object.entries(latest50Payment.amount)
        .map(([cat, amt]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ₹${Number(amt || 0).toLocaleString('en-IN')}`)
        .join(" + ");
    } else {
      receivedAmount50 = Number(latest50Payment.amount || 0);
    }

    const formattedAmount50 = receivedAmount50.toLocaleString('en-IN');
    const displayAmount50 = amountBreakdown50 ? `${amountBreakdown50} = ₹${formattedAmount50}` : `₹${formattedAmount50}`;

    const pdfBuffer = await generatePaymentPDF(pending, payment, action);

    const mailOptions = {
      from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
      to: clientEmail,
      bcc: pending.clientDetails.email2 || undefined,
      subject: "Final Payment Received - Your Rajasthan Trip is Fully Confirmed!",
      html: `
        <div style="font-family: Verdana; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #fff;">
          <h2 style="color: #d4af37; text-align: center;">${software?.companyName || "Rajasthan Touring"}</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p style="margin-bottom: 20px; font-style: italic;">
  "Khammaghani" 
</p>
          <p>We are pleased to confirm that we have received your <strong>50% final payment in cash</strong>.</p>
          
          <p>Your booking is now <strong>fully paid and confirmed</strong>.</p>

          <p>We have successfully received your final payment of:</p>
          <h2 style="color: green; text-align: center;">${displayAmount50}</h2>

          ${amountBreakdown50 ? `<p><strong>Breakdown:</strong> ${amountBreakdown50}</p>` : ''}

          <h3>Booking Summary</h3>
          <ul>
            <li><strong>Confirmation No.:</strong> ${bookingId}</li>
            <li><strong>Tour Package:</strong> ${tourName}</li>
            <li><strong>Travel Dates:</strong> ${startDate} – ${endDate}</li>
            <li><strong>Guest Name:</strong> ${clientName}</li>
            <li>
              <strong>Total Guests:</strong>
              ${pending.clientDetails?.travelers || pending.clientDetails?.adults}
              ${pending.clientDetails?.adults ? `(Adults: ${pending.clientDetails.adults}` : ''}
              ${pending.clientDetails?.kids5to12 ? `, Kids 5-12: ${pending.clientDetails.kids5to12}` : ''}
              ${pending.clientDetails?.kidsBelow5 ? `, Below 5: ${pending.clientDetails.kidsBelow5}` : ''}
              ${pending.clientDetails?.adults || pending.clientDetails?.kids5to12 || pending.clientDetails?.kidsBelow5 ? ')' : ''}
            </li>
          </ul>

          <h3>Payment Status</h3>
          <ul>
            <li>20% – Advance <strong style="color: green;">(Received)</strong></li>
            <li>30% – Voucher Payment <strong style="color: green;">(Received)</strong></li>
            <li>50% – Final Payment <strong style="color: green;">(Received in cash)</strong></li>
          </ul>

          <p>Thank you for your cooperation. We look forward to giving you a memorable Rajasthan experience!</p>

          <p>For any queries, feel free to call/WhatsApp us at <strong>${pending.contact?.mobiles[0]}</strong>.</p>

          <br>
          <p>Warm Regards,<br>
          <strong> ${pending.contact?.name}<br>
          Jaipur, Rajasthan </strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `Final_Payment_Confirmation_${pending._id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        }
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`50% Final Confirmation email sent to ${clientEmail} | Amount: ₹${formattedAmount50}`);
  } catch (err) {
    console.error("Failed to send 50% confirmation email:", err);
  }
};
// ==================== GENERAL EMAIL CHECKER ====================
const checkAndSendMilestoneEmails = async (pending, oldTotalPaid, payment, action) => {
  const totalAmount = pending.totalAmount || 0;
  const newTotalPaid = calculateTotalPaid(pending.payments);

  // 20% Threshold: First time >= 20%
  if (oldTotalPaid < 0.2 * totalAmount && newTotalPaid >= 0.2 * totalAmount) {
    await send20PercentConfirmationEmail(pending);

    await pending.save();
  }

  // 50% Cumulative Threshold (20% + 30%): First time >= 50%
  if (oldTotalPaid < 0.5 * totalAmount && newTotalPaid >= 0.5 * totalAmount) {
    await send30PercentConfirmationEmail(pending, payment, action);
  }

  if (oldTotalPaid < totalAmount && newTotalPaid >= totalAmount) {
    await send50PercentConfirmationEmail(pending, payment, action)
    await pending.save()
  }
};




const authMiddleware = (req, res, next) => {
  const token = req.cookies.admin_token || req.cookies.token || req.cookies.user_token // Check both token and admin_token

  console.log(token)

  if (!token) return res.status(401).json({ message: "Not authenticated" })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" })
  }
}

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
    pass: process.env.EMAIL_PASS || "bhsh nipi oory ayop",
  },
})




// Add a new payment
router.post("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }

    const oldTotalPaid = calculateTotalPaid(booking.payments);

    const hadAnySuccessBefore = (booking.payments || []).some((p) => p.status === "success")

    const payment = {
      ...req.body,
      paymentDate: new Date(),
      _id: new mongoose.Types.ObjectId(),
    }

    booking.payments = booking.payments || []
    booking.payments.push(payment)

    // If first time marking any payment as success, set status to Booked
    if (!hadAnySuccessBefore && payment.status === "success") {
      booking.status = "Booked"
    }

    booking.updatedAt = Date.now()
    await booking.save()

    // await sendPaymentEmail(booking, payment, "added")
    await sendPaymentEmailadmin({
      adminEmail: process.env.EMAIL_USER,
      bookingDetails: booking,
      clientDetails: booking.clientDetails,
      paymentDetails: payment,
    })


    // Check and send milestone emails
    await checkAndSendMilestoneEmails(booking, oldTotalPaid, payment, "added");


    const io = req.app.get("io");
    io.emit("new_payment", {
      message: "New payment added (admin)",
      bookingId: booking._id,
      payment,
      user: booking.clientDetails,
      status: booking.status,
    });

    res.status(201).json(booking)
  } catch (error) {
    console.error("Error adding payment:", error)
    res.status(500).json({ message: "Failed to add payment", error: error.message })
  }
})

// Update an existing payment
router.put("/:bookingId/:paymentId", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }
    const oldTotalPaid = calculateTotalPaid(booking.payments);
    const hadAnySuccessBefore = (booking.payments || []).some((p) => p.status === "success")

    const paymentIndex = booking.payments.findIndex((p) => p._id.toString() === req.params.paymentId)
    if (paymentIndex === -1) {
      return res.status(404).json({ message: "Payment not found" })
    }

    const updated = {
      ...booking.payments[paymentIndex],
      ...req.body,
      paymentDate: new Date(),
      _id: booking.payments[paymentIndex]._id,
    }
    booking.payments[paymentIndex] = updated

    // If first time marking any payment as success, set status to Booked
    if (!hadAnySuccessBefore && updated.status === "success") {
      booking.status = "Booked"
    }

    booking.updatedAt = Date.now()
    await booking.save()
    // await sendPaymentEmail(booking, booking.payments[paymentIndex], "updated")

    // // Send admin notification email on payment update
    // await sendPaymentEmailadmin({
    //   adminEmail: process.env.EMAIL_USER,
    //   bookingDetails: booking,
    //   clientDetails: booking.clientDetails,
    //   paymentDetails: booking.payments[paymentIndex],


    // })

    await checkAndSendMilestoneEmails(booking, oldTotalPaid, updated, "updated");

    res.status(200).json(booking)
  } catch (error) {
    console.error("Error updating payment:", error)
    res.status(500).json({ message: "Failed to update payment", error: error.message })
  }
})



// Add a new payment (from user/client perspective)
router.post("/user/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }

    const hadAnySuccessBefore = (booking.payments || []).some((p) => p.status === "success")

    const payment = {
      ...req.body,
      status: req.body.status || "pending",
      paymentDate: new Date(),
      _id: new mongoose.Types.ObjectId(),
      screenshot: req.body.screenshot || req.body.receiptUrl, // Map screenshot to receiptUrl if needed
    }

    booking.payments = booking.payments || []
    booking.payments.push(payment)

    // If first time marking any payment as success, set status to Booked
    if (!hadAnySuccessBefore && payment.status === "success") {
      booking.status = "Booked"
    }

    booking.updatedAt = Date.now()
    await booking.save()
    await sendPaymentEmailadmin({
      adminEmail: process.env.EMAIL_USER,
      bookingDetails: booking,
      clientDetails: booking.clientDetails,
      paymentDetails: payment,
    })


    const io = req.app.get("io");
    io.emit("new_payment", {
      message: "New payment added",
      bookingId: booking._id,
      payment,
      user: booking.clientDetails,
      status: booking.status,
    });

    res.status(201).json(booking)
  } catch (error) {
    console.error("Error adding payment:", error)
    res.status(500).json({ message: "Failed to add payment", error: error.message })
  }
})

// Generate and download PDF
router.get("/:bookingId/pdf/:action", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const action = req.params.action;
    const latestPayment = booking.payments && booking.payments.length > 0 ? booking.payments[booking.payments.length - 1] : null;

    const pdfBuffer = await generatePaymentPDF(booking, latestPayment, action);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Payment_${action}_${booking._id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

// Returns text content and a wa.me link with encoded message to client's phone
router.get("/:bookingId/whatsapp", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const rawPhone =
      booking.clientDetails?.phone ||
      booking.clientDetails?.mobile ||
      booking.clientDetails?.mobileNumber ||
      booking.clientDetails?.whatsapp ||
      booking.clientDetails?.whatsappNumber ||
      booking.clientDetails?.contact ||
      '';

    let phone = rawPhone.replace(/[^0-9]/g, ''); // Remove non-digits
    if (!phone) {
      return res.status(400).json({ message: "No phone number available for WhatsApp" });
    }


    const allPayments = booking.payments || [];
    const latestPayment = allPayments[allPayments.length - 1] || null;
    const totalPaid = allPayments
      .filter((p) => p.status === "success")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const remaining = Math.max(0, (booking.totalAmount || 0) - totalPaid);

    const company = await Companybilldata.findOne();

    // Generate the PDF
    const pdfBuffer = await generatePaymentPDF(booking, latestPayment, "updated");

    // Ensure the public/pdfs directory exists
    const pdfsDir = path.join(__dirname, "..", "public", "pdfs");
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }

    // Save the PDF temporarily
    const pdfFileName = `Payment_${booking._id}_${Date.now()}.pdf`;
    const pdfPath = path.join(pdfsDir, pdfFileName);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Create a public URL for the PDF
    const pdfUrl = `${serverBase}/pdfs/${pdfFileName}`;

    // Construct the WhatsApp message
    const lines = [
      `Payment Update`,
      `Hii: ${booking.clientDetails?.name || "Guest"} (${booking.clientDetails?.email || "N/A"})`,
      `Package: ${booking.itineraryData?.titles?.[0] || "N/A"}`,
      latestPayment
        ? `Latest Payment: ₹${Number(latestPayment.amount || 0)} | ${latestPayment.status || "N/A"} | ${new Date(latestPayment.paymentDate).toLocaleDateString()}`
        : `Latest Payment: N/A`,
      `Total Paid: ₹${totalPaid}`,
      `Remaining: ₹${remaining}`,
      `View Itinerary: ${clientBase}/${booking.theme.link}/${booking._id}`,
      `Download Recipt: ${pdfUrl}`, // Add the PDF URL to the message
    ];

    const text = lines.join("\n");
    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    // Optional: Schedule cleanup of the PDF file after a certain time (e.g., 1 hour)
    setTimeout(() => {
      try {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`Cleaned up temporary PDF: ${pdfFileName}`);
        }
      } catch (err) {
        console.error(`Error cleaning up PDF ${pdfFileName}:`, err);
      }
    }, 60 * 60 * 1000); // 1 hour

    return res.json({ text, waLink, pdfUrl });
  } catch (err) {
    console.error("WhatsApp message error:", err);
    return res.status(500).json({ message: "Failed to build WhatsApp message" });
  }
});

module.exports = router