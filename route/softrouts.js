const express = require("express");
const Inquiry = require("../model/softmails");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const User = require("../model/user/user");
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: Authenticate (unified for both tokens)
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.cookies.admin_token || req.cookies.user_token;
  console.log(token);

  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid token" });
  }
}

// Middleware: Require Non-User (admin, manager, staff)
function requireNonUser(req, res, next) {
  if (req.user.role === "user") {
    return res.status(403).json({ message: "Access denied: Insufficient permissions" });
  }
  next();
}

// ✅ Create new inquiry (public) - status defaults to 'pending'
router.post("/", async (req, res) => {
  try {
    const { name, email, mobile, packageTitle, car, message, other } = req.body;

    // const transporter = nodemailer.createTransport({
    //   host: "smtp.gmail.com",
    //   port: 587,
    //   secure: false,
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASS,
    //   },
    // });

    // 🔹 If message is provided, show "Custom Package"
    const enquiryTitle = [message ? packageTitle : null, car?.title, packageTitle]
      .find(val => val != null && val !== "") || "Custom Package";

    const inquiry = new Inquiry({ ...req.body, assignedTo: null });
    console.log(inquiry);

    await inquiry.save();
     const populatedInquiry = await Inquiry.findById(inquiry._id)
      .populate('assignedTo', 'name email');


    // ------------------ 2️⃣ Admin Enquiry Details ------------------
    let adminTable = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr>
          <td colspan="2" style="border:1px solid #ddd; padding:10px; font-weight:bold; text-align:center; background:#f5f5f5; font-size:16px;">
           Enquiry Details
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Name :</td>
          <td style="border:1px solid #ddd; padding:8px;">
            <a >${name}</a>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Email :</td>
          <td style="border:1px solid #ddd; padding:8px;">
            <a href="mailto:${email}">${email}</a>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Mobile :</td>
          <td style="border:1px solid #ddd; padding:8px;">
            <a href="tel:${mobile}">${mobile}</a>
          </td>
        </tr>

         ${message
        ? `
          <tr>
            <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Message</td>
            <td style="border:1px solid #ddd; padding:8px;">${message}</td>
          </tr>
          `
        : ""
      }
        <tr>
          <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Enquiry For :</td>
          <td style="border:1px solid #ddd; padding:8px;">${enquiryTitle}</td>
        </tr>
        ${car?.type
        ? `
          <tr>
            <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Car Type</td>
            <td style="border:1px solid #ddd; padding:8px;">${car.type}</td>
          </tr>
          `
        : ""
      }
        ${other
        ? `
          <tr>
            <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Code</td>
            <td style="border:1px solid #ddd; padding:8px;">${other}</td>
          </tr>
          `
        : ""
      }
        
      </table>
    `;

    // await transporter.sendMail({
    //   from: `"Website Enquiry" <${process.env.EMAIL_USER}>`,
    //   to: process.env.EMAIL_USER,
    //   subject: `📩 New Enquiry: ${other ? `Code-${other} ` : ""}${enquiryTitle}`,
    //   html: `
    //     <div style="font-family:PoltawskiNowy ; padding:30px; background:#f5f5f5;">
    //       <div style="max-width:90%; margin:auto; background:#fff; padding:30px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
  
    //         ${adminTable}
    //         <p style="font-size:12px; color:#999; margin-top:20px;">This enquiry was submitted through your website.</p>
    //       </div>
    //     </div>
    //   `,
    // });


    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('newInquiry', populatedInquiry);
      console.log('New inquiry emitted to admin-room');
    }

    res.status(201).json({ success: true, data: inquiry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ Get all inquiries (filtered by role) - includes status
router.get("/", authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'user') {
      query.assignedTo = req.user.id;
    }
    // For non-users (admin/manager/staff), no filter (all inquiries)

    const inquiries = await Inquiry.find(query)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: inquiries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Get single inquiry - includes status
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    if (req.user.role === 'user') {
      query.assignedTo = req.user.id;
    }
    const inquiry = await Inquiry.findOne(query).populate('assignedTo', 'name email');
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Assign inquiry - unchanged
router.put("/:id/assign", authenticateToken, requireNonUser, async (req, res) => {
  try {
    const { assignedTo } = req.body;
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (!user || user.role === 'admin') { // Optionally prevent assigning to admin
        return res.status(404).json({ success: false, message: "User not found or invalid" });
      }
    }

    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      { assignedTo: assignedTo || null },
      { new: true }
    ).populate('assignedTo', 'name email');

    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ Update inquiry (now supports status updates too)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    if (req.user.role === 'user') {
      query.assignedTo = req.user.id;
    }
    // Validate status if provided
    if (req.body.status && !['pending', 'ongoing', 'booked', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }
    const inquiry = await Inquiry.findOneAndUpdate(query, req.body, { new: true }).populate('assignedTo', 'name email');
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ New: Dedicated status update (optional, for quick status changes)
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    if (req.user.role === 'user') {
      query.assignedTo = req.user.id;
    }
    const { status, cancelReason } = req.body;
    if (!status || !['pending', 'ongoing', 'booked', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }
    // If cancelling, ensure reason is provided
    if (status === 'cancelled' && (!cancelReason || !cancelReason.trim())) {
      return res.status(400).json({ success: false, message: "Cancel reason is required" });
    }
    const updateData = { status };
    if (status === 'cancelled') {
      updateData.cancelReason = cancelReason;
    }
    const inquiry = await Inquiry.findOneAndUpdate(query, updateData, { new: true }).populate('assignedTo', 'name email');
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ✅ Delete inquiry - unchanged
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    if (req.user.role === 'user') {
      query.assignedTo = req.user.id;
    }
    const inquiry = await Inquiry.findOneAndDelete(query);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, message: "Inquiry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;