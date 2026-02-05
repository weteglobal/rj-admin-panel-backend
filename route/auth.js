const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../model/user/user");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const nodemailer = require("nodemailer"); // 👈 Add this import
const { log } = require("console");
const JWT_SECRET = process.env.JWT_SECRET;
const app = express()
// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
app.use("/uploads", express.static("uploads")); // 👈 ज़रूरी



const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


const authMiddleware = (req, res, next) => {
  const token = req.cookies.token || req.cookies.admin_token || req.cookies.user_token; // Check both token and admin_token
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};


// User Registration
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hash, role: "user", plainPassword: password });
    await newUser.save();
    res.json({ ok: true, message: "User registered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error registering user" });
  }
});


// User Login (only for 'user' role)
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  res.clearCookie("admin_token");
  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });

    }

    // 🚫 Prevent admin email from logging in as a normal user
    if (email === process.env.EMAIL_ADMIN) {
      return res.status(403).json({ message: "Please use admin login for admin accounts." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.status !== "active") {
      return res.status(403).json({ message: "User inactive" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: 10 * 24 * 60 * 60 }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/"
    });

    res.json({ ok: true, role: user.role, permissions: user.permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin Login
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    // ✅ SUPER ADMIN LOGIN (NO OTP, NO DB CHECK)
    const superAdmin = await User.findOne({ email, role2: "superadmin" });

    if (superAdmin) {
      const isMatch = await bcrypt.compare(password, superAdmin.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Create token
      const token = jwt.sign(
        {
          id: superAdmin._id,
          role: "admin",     // backend purpose
          role2: "superadmin",
          permissions: ["all"],
          superAdmin: true
        },
        JWT_SECRET,
        { expiresIn: "10d" }
      );

      // Set cookie
      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: true,        // localhost → https API allowed
        sameSite: "none",    // LAX nahi chalega
        path: "/"
      });

      return res.json({
        ok: true,
        message: "Super Admin logged in successfully (NO OTP)",
        superAdmin: true
      });
    }


    // ✅ Normal admin logic neeche
    const user = await User.findOne({ email, role: "admin" });
    if (!user) return res.status(404).json({ message: "Admin not found" });

    if (user.status !== "active")
      return res.status(403).json({ message: "Admin inactive" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    // 🔥 Generate OTP for normal admin
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetToken = otp;
    user.resetTokenExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Admin Login OTP",
      html: `<h2>Your Admin Login OTP is: <strong>${otp}</strong></h2>
             <p>OTP valid for 10 minutes.</p>`
    });

    res.json({ ok: true, message: "OTP sent to email. Please verify OTP." });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email, role: "admin" });
    if (!user) return res.status(404).json({ message: "Admin not found" });

    // Check OTP validity
    if (!user.resetToken || user.resetTokenExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (user.resetToken !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Clear OTP after verification
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    // Generate admin login token
    const token = jwt.sign({ id: user._id, role: "admin" }, JWT_SECRET, {
      expiresIn: "10d",
    });

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: true,        // required for cross-site
      sameSite: "none",    // required for cross-site
      path: "/"
    });

    res.json({ ok: true, message: "Admin logged in successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get logged-in user
router.get("/me", authMiddleware, async (req, res) => {
  try {

    console.log(req.user);

    const user = await User.findById(req.user.id || req.user._id).select("-password")
    console.log(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" })
    res.json({ ok: true, user })
  } catch (err) {
    res.status(500).json({ message: "Server error" })
  }
})

// Update Profile
router.put("/profile", authMiddleware, async (req, res) => {
  const { name, password } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();
    res.json({ ok: true, message: "Profile updated", user: { name: user.name, email: user.email, role: user.role, profilePhoto: user.profilePhoto } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Upload Profile Photo
// Upload Profile Photo
router.post("/profile/photo", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Agar pehle se profilePhoto hai to update hoga, nahi hai to add ho jayega
    user.profilePhoto = `/uploads/${req.file.filename}`;

    await user.save();

    res.json({
      ok: true,
      message: user.isModified("profilePhoto") ? "Photo updated" : "Photo uploaded",
      profilePhoto: user.profilePhoto,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token")
  res.clearCookie("user_token")
  res.clearCookie("admin_token")
  res.json({ ok: true, message: "Logged out" })
})



router.post("/forgot-password/send-otp", async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "User is inactive" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = jwt.sign({ otp, email }, JWT_SECRET, { expiresIn: "15m" }); // Token for verification, expires in 15 min

    // Save to user (hashed for security, but since short-lived, plain is ok; use hash if paranoid)
    user.resetToken = token;
    user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    await user.save();

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP - Your App",
      html: `
        <h2>Password Reset Request</h2>
        <p>Your OTP for password reset is: <strong>${otp}</strong></p>
        <p>This OTP expires in 15 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error sending OTP" });
  }
});

// New: Verify OTP and Reset Password
router.post("/forgot-password/reset", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.resetToken || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Verify OTP via JWT
    try {
      const decoded = jwt.verify(user.resetToken, JWT_SECRET);
      if (decoded.email !== email || decoded.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
    } catch (err) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset fields
    user.password = hash;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ ok: true, message: "Password reset successful. Please login." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error resetting password" });
  }
});
module.exports = router;