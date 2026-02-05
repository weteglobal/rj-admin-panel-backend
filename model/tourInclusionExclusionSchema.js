const mongoose = require("mongoose");

const tourInclusionExclusionSchema = new mongoose.Schema(
  {
    inclusions: {
      type: [
        {
          title: { type: String,  },
          description: { type: String,  },
          image: { type: String },
        },
      ],
      default: [],
    },
    exclusions: {
      type: [
        {
          title: { type: String,  },
          description: { type: String,  },
          image: { type: String },
        },
      ],
      default: [],
    },
    termsAndConditions: {
      type: [
        {
          title: { type: String,  },
          description: { type: String,  },
          image: { type: String },
        },
      ],
      default: [],
    },
    cancellationAndRefundPolicy: {
      type: [
        {
          title: { type: String,  },
          description: { type: String,  },
          image: { type: String },
        },
      ],
      default: [],
    },
    travelRequirements: {
      type: [
        {
          title: { type: String,  },
          description: { type: String,  },
          image: { type: String },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TourInclusionExclusion", tourInclusionExclusionSchema);