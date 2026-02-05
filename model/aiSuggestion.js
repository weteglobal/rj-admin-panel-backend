const mongoose = require("mongoose");

const aiSuggestionSchema = new mongoose.Schema(
  {
    suggestions: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("AISuggestion", aiSuggestionSchema);
