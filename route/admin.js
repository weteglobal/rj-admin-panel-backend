const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../model/user/user");
const bcrypt = require("bcryptjs");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: Require Admin
function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  console.log(token);


  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin")
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    req.admin = decoded;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid token" });
  }
}

router.put("/update-password/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update both hashed password and plain password
    user.password = await bcrypt.hash(password, 10);
    user.plainPassword = password; // Store plain password for admin view

    await user.save();

    res.json({ ok: true, message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating password" });
  }
});

// Get All Users (with role separation and status filter)
router.get("/users", async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const users = await User.find({
      ...query,
      isSuperAdmin: { $ne: true }  // 🔥 Super Admin hide
    }).select("name email role permissions status plainPassword");
    const userRoleUsers = users.filter((u) => u.role === "user");
    const otherRoleUsers = users.filter((u) => u.role !== "user");

    res.json({
      ok: true,
      users: {
        regularUsers: userRoleUsers,
        otherRoles: otherRoleUsers,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

router.get("/check-admin", (req, res) => {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.json({ isAdmin: false });
  }

  // optional: token verify bhi kar sakte ho
  return res.json({ isAdmin: true });
});


// Update User Role/Status/Permissions
router.put("/update-user/:id", requireAdmin, async (req, res) => {
  const { role, status, permissions } = req.body;
  console.log(req.body);

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === process.env.EMAIL_ADMIN) {
      return res.status(403).json({ message: "Cannot modify static admin account" });
    }
    if (user._id.toString() === req.admin.id) {
      return res.status(403).json({ message: "Cannot modify your own account" });
    }

    const updates = {};
    if (role) updates.role = role;
    if (status) updates.status = status;
    if (permissions) updates.permissions = permissions;

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    res.json({ ok: true, user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user" });
  }
});

module.exports = router;
