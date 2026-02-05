// routes/structure.js
const express = require("express");
const structure = require("../model/user/structure");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});
const upload = multer({
  storage,

});

// Serve uploaded files statically
router.use("/uploads", express.static(uploadDir));

// Create user
router.post(
  "/",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "bankLogos", maxCount: 10 },
    { name: "walletLogos", maxCount: 10 },
    { name: "qrImages", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const existingUser = await structure.findOne();
      if (existingUser) {
        return res.status(400).json({ error: "Only one user can be created" });
      }

      const contacts = req.body.contacts ? JSON.parse(req.body.contacts) : [];
      const addresses = req.body.addresses ? JSON.parse(req.body.addresses) : [];
      const socialLinks = req.body.socialLinks ? JSON.parse(req.body.socialLinks) : {};
      const bankDetails = req.body.bankDetails ? JSON.parse(req.body.bankDetails) : [];
      const paymentIds = req.body.paymentIds ? JSON.parse(req.body.paymentIds) : [];
      const sosNumber = req.body.sosNumber ? parseInt(req.body.sosNumber, 10) : 0;

      // Copy addresses and socialLinks to each contact
      const updatedContacts = contacts.map(contact => ({
        ...contact,
        addresses,
        socialLinks
      }));

      // Map uploaded bank logos to bankDetails
      const bankLogos = req.files["bankLogos"] || [];
      let bankFileIndex = 0;
      bankDetails.forEach((bank) => {
        if (bank.newBankLogo) {
          bank.logoUrl = `/uploads/${bankLogos[bankFileIndex].filename}`;
          bankFileIndex++;
          delete bank.newBankLogo;
        }
      });

      // Map uploaded wallet logos to paymentIds
      const walletLogos = req.files["walletLogos"] || [];
      let walletFileIndex = 0;
      paymentIds.forEach((wallet) => {
        if (wallet.newWalletLogo) {
          wallet.logoUrl = `/uploads/${walletLogos[walletFileIndex].filename}`;
          walletFileIndex++;
          delete wallet.newWalletLogo;
        }
      });

      // Map uploaded QR images to paymentIds
      const qrImages = req.files["qrImages"] || [];
      let qrFileIndex = 0;
      paymentIds.forEach((wallet) => {
        if (wallet.newQrImage) {
          wallet.qrImageUrl = `/uploads/${qrImages[qrFileIndex].filename}`;
          qrFileIndex++;
          delete wallet.newQrImage;
        }
      });

      const userData = {
        contacts: updatedContacts,
        addresses,
        socialLinks,
        bankDetails,
        paymentIds,
        sosNumber,
        logo: req.files["logo"] ? `/uploads/${req.files["logo"][0].filename}` : undefined,
      };

      const user = new structure(userData);
      await user.save();
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Update user
router.put(
  "/:id",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "bankLogos", maxCount: 10 },
    { name: "walletLogos", maxCount: 10 },
    { name: "qrImages", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const existingUser = await structure.findById(req.params.id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      let parsedContacts = req.body.contacts ? JSON.parse(req.body.contacts) : existingUser.contacts || [];
      let parsedAddresses = req.body.addresses ? JSON.parse(req.body.addresses) : existingUser.addresses || [];
      let parsedSocialLinks = req.body.socialLinks ? JSON.parse(req.body.socialLinks) : existingUser.socialLinks || {};
      const bankDetails = req.body.bankDetails ? JSON.parse(req.body.bankDetails) : existingUser.bankDetails || [];
      const paymentIds = req.body.paymentIds ? JSON.parse(req.body.paymentIds) : existingUser.paymentIds || [];
      const sosNumber = req.body.sosNumber ? parseInt(req.body.sosNumber, 10) : existingUser.sosNumber || 0;

      // Copy parsed addresses and socialLinks to each contact
      const updatedContacts = parsedContacts.map(contact => ({
        ...contact,
        addresses: parsedAddresses,
        socialLinks: parsedSocialLinks
      }));

      console.log(updatedContacts);
      console.log(req.body);


      // Map uploaded bank logos to bankDetails, preserving existing logoUrl if no new file
      const bankLogos = req.files["bankLogos"] || [];
      let bankFileIndex = 0;
      bankDetails.forEach((bank, bankIdx) => {
        if (bank.newBankLogo) {
          bank.logoUrl = `/uploads/${bankLogos[bankFileIndex].filename}`;
          bankFileIndex++;
          delete bank.newBankLogo;
        } else {
          // Preserve existing logoUrl if no new file is uploaded
          bank.logoUrl = bank.logoUrl || (existingUser.bankDetails[bankIdx]?.logoUrl || null);
        }
      });

      // Map uploaded wallet logos to paymentIds, preserving existing logoUrl if no new file
      const walletLogos = req.files["walletLogos"] || [];
      let walletFileIndex = 0;
      paymentIds.forEach((wallet, walletIdx) => {
        if (wallet.newWalletLogo) {
          wallet.logoUrl = `/uploads/${walletLogos[walletFileIndex].filename}`;
          walletFileIndex++;
          delete wallet.newWalletLogo;
        } else {
          // Preserve existing logoUrl if no new file is uploaded
          wallet.logoUrl = wallet.logoUrl || (existingUser.paymentIds[walletIdx]?.logoUrl || null);
        }
      });

      // Map uploaded QR images to paymentIds, preserving existing qrImageUrl if no new file
      const qrImages = req.files["qrImages"] || [];
      let qrFileIndex = 0;
      paymentIds.forEach((wallet, walletIdx) => {
        if (wallet.newQrImage) {
          wallet.qrImageUrl = `/uploads/${qrImages[qrFileIndex].filename}`;
          qrFileIndex++;
          delete wallet.newQrImage;
        } else {
          // Preserve existing qrImageUrl if no new file is uploaded
          wallet.qrImageUrl = wallet.qrImageUrl || (existingUser.paymentIds[walletIdx]?.qrImageUrl || null);
        }
      });

      const userData = {
        contacts: updatedContacts,
        addresses: parsedAddresses,
        socialLinks: parsedSocialLinks,
        bankDetails,
        paymentIds,
        sosNumber,
        logo: req.files["logo"] ? `/uploads/${req.files["logo"][0].filename}` : existingUser.logo,
      };

      const user = await structure.findByIdAndUpdate(req.params.id, userData, { new: true });
      // Update each contact in array
      const updatedContactss = user.contacts.map((contact) => ({
        ...contact.toObject(),
        addresses: parsedAddresses || contact.addresses,
        socialLinks: parsedSocialLinks || contact.socialLinks,
      }));

      // Save back updated contacts
      user.contacts = updatedContactss;
      await user.save();

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get user
router.get("/", async (req, res) => {
  try {
    const user = await structure.findOne();
    if (!user) {
      return res.status(404).json({ error: "No user found" });
    }
    // Sync addresses and socialLinks to contacts if missing
    const updatedContacts = user.contacts.map(contact => ({
      ...contact.toObject(),
      addresses: contact.addresses && contact.addresses.length > 0 ? contact.addresses : (user.addresses || []),
      socialLinks: contact.socialLinks && Object.keys(contact.socialLinks).length > 0 ? contact.socialLinks : (user.socialLinks || {})
    }));
    const syncedUser = {
      ...user.toObject(),
      contacts: updatedContacts
    };
    res.json(syncedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single user by ID
router.get("/:id", async (req, res) => {
  try {
    const user = await structure.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Sync addresses and socialLinks to contacts if missing
    const updatedContacts = user.contacts.map(contact => ({
      ...contact.toObject(),
      addresses: contact.addresses && contact.addresses.length > 0 ? contact.addresses : (user.addresses || []),
      socialLinks: contact.socialLinks && Object.keys(contact.socialLinks).length > 0 ? contact.socialLinks : (user.socialLinks || {})
    }));
    const syncedUser = {
      ...user.toObject(),
      contacts: updatedContacts
    };
    res.json(syncedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete("/:id", async (req, res) => {
  try {
    const user = await structure.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Delete associated files
    if (user.logo) {
      const filePath = path.join(__dirname, "../", user.logo);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    user.bankDetails.forEach((bank) => {
      if (bank.logoUrl) {
        const filePath = path.join(__dirname, "../", bank.logoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });
    user.paymentIds.forEach((wallet) => {
      if (wallet.logoUrl) {
        const filePath = path.join(__dirname, "../", wallet.logoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      if (wallet.qrImageUrl) {
        const filePath = path.join(__dirname, "../", wallet.qrImageUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;    