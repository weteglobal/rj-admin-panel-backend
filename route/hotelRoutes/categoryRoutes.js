const express = require("express");
const Category = require("../../model/hotel/Category");
const Hotel = require("../../model/hotel/Hotel");
const router = express.Router();

// GET all categories
router.get("/", async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
});

// CREATE new category
router.post("/", async (req, res) => {
  try {
    const category = new Category({ name: req.body.name });
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE category (and hotels under it)
router.delete("/:id", async (req, res) => {
  try {
    await Hotel.deleteMany({ categoryId: req.params.id });
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// UPDATE category
router.put("/:id", async (req, res) => {
  try {
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name },
      { new: true } // updated document return karega
    );
    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(updatedCategory);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


module.exports = router;
