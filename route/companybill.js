const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const Company = require("../model/Companybill");

// Configure Multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, "logo-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,

});

// ✅ Create or Update single company info with logo upload
router.post("/", upload.single("companyLogo"), async (req, res) => {
  try {
    const companyData = req.body;

    if (req.file) {
      companyData.companyLogo = req.file.filename;
    }

    // Upsert ensures only one document exists
    const company = await Company.findOneAndUpdate(
      {},
      companyData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Company info saved/updated", data: company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});


// ✅ Get the single company info
router.get("/", async (req, res) => {
  try {
    const company = await Company.findOne(); // only fetch the single doc
    if (!company) return res.status(404).json({ error: "Company info not found" });
    res.json(company);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;    