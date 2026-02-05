const express = require("express");
const AISuggestion = require("../model/aiSuggestion");
const router = express.Router();

// 📌 Get suggestions
router.get("/", async (req, res) => {
  try {
    const data = await AISuggestion.findOne();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📌 Add suggestion
router.post("/add", async (req, res) => {
  try {
    const { title, description } = req.body;

    let doc = await AISuggestion.findOne();
    if (!doc) {
      doc = new AISuggestion({ suggestions: [] });
    }

    doc.suggestions.push({ title, description });
    await doc.save();

    res.json({ success: true, message: "Suggestion added", data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📌 Update suggestion by index
router.put("/update/:index", async (req, res) => {
  try {
    const { index } = req.params;
    const { title, description } = req.body;

    const doc = await AISuggestion.findOne();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });

    doc.suggestions[index] = { title, description };
    await doc.save();

    res.json({ success: true, message: "Suggestion updated", data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📌 Delete suggestion by index
router.delete("/delete/:index", async (req, res) => {
  try {
    const { index } = req.params;

    const doc = await AISuggestion.findOne();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });

    doc.suggestions.splice(index, 1);
    await doc.save();

    res.json({ success: true, message: "Suggestion deleted", data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
