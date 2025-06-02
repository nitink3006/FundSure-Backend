const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters'],
  },
  description: {
    type: String,
    required: [true, 'Please provide a description'],
    maxlength: [500, 'Description cannot be more than 500 characters'],
  },
  story: {
    type: String,
    required: [true, 'Please provide a detailed campaign story'],
  },
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: [
      'Education',
      'Medical',
      'Environment',
      'Animal Welfare',
      'Disaster Relief',
      'Sports',
      'Elderly Care',
      'Child Welfare',
      'Community',
      'Arts',
    ],
  },
  goalAmount: {
    type: Number,
    required: [true, 'Please specify a goal amount'],
    min: [1, 'Goal amount must be at least $1'],
  },
  raisedAmount: {
    type: Number,
    default: 0,
  },
  duration: {
    type: Number,
    required: [true, 'Please specify campaign duration in days'],
    min: [1, 'Duration must be at least 1 day'],
  },
  imageUrl: {
    type: String,
    required: [true, 'Please upload a campaign image'],
  },
  additionalImages: [
    {
      type: String,
    }
  ],
  videos: [
    {
      type: String,
    }
  ],
  verificationDocuments: [
    {
      type: String,
      required: [true, 'Please upload a verification document'],
    }
  ],
  cloudinaryData: {
    coverImageId: String,
    additionalImageIds: [String],
    videoIds: [String],
    verificationDocumentIds: [String],
    imageAnalysisResults: Object // Stores results from image processing
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  backers: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'rejected'],
    default: 'pending',
  },
  isEmergency: {
    type: Boolean,
    default: false,
  },
  rejectionReason: {
    type: String,
  },
  endDate: {
    type: Date,
    required: true,
  },
  fraudAnalysisData: {
    analyzedAt: {
      type: Date,
    },
    fraudScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      enum: ['Very Low', 'Low', 'Medium', 'High', 'Very High', 'Critical', 'Unknown'],
    },
    indicators: [
      {
        type: {
          type: String,
        },
        severity: {
          type: String,
          enum: ['Low', 'Medium', 'High'],
        },
        description: {
          type: String,
        },
        imageEvidence: String // URL to image evidence if applicable
      }
    ],
    recommendation: {
      type: String,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalNote: {
      type: String,
    },
    rejectionNote: {
      type: String,
    },
    manualReviewRequired: {
      type: Boolean,
      default: false,
    },
    imageAnalysis: {
      type: Object,
      default: null
    }
  },
  updates: [
    {
      title: String,
      content: String,
      date: {
        type: Date,
        default: Date.now,
      },
      images: [String],
    },
  ],
  comments: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      content: String,
      date: {
        type: Date,
        default: Date.now,
      },
      attachments: [String],
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Virtual for calculating days left
CampaignSchema.virtual('daysLeft').get(function () {
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for getting fraud risk status
CampaignSchema.virtual('fraudRisk').get(function () {
  if (this.fraudAnalysisData && this.fraudAnalysisData.riskLevel) {
    return this.fraudAnalysisData.riskLevel;
  }
  return 'Not Analyzed';
});

// Virtual for image analysis summary
CampaignSchema.virtual('imageAnalysisSummary').get(function () {
  if (this.fraudAnalysisData && this.fraudAnalysisData.imageAnalysis) {
    return {
      riskScore: this.fraudAnalysisData.imageAnalysis.overallRiskScore,
      indicators: this.fraudAnalysisData.imageAnalysis.imageIndicators
    };
  }
  return null;
});

// Indexes for better performance
CampaignSchema.index({ 'fraudAnalysisData.fraudScore': 1 });
CampaignSchema.index({ 'fraudAnalysisData.riskLevel': 1 });
CampaignSchema.index({ status: 1, 'fraudAnalysisData.fraudScore': 1 });
CampaignSchema.index({ 'cloudinaryData.imageAnalysisResults': 1 });

// Pre-save hook to process images
CampaignSchema.pre('save', async function(next) {
  if (this.isModified('imageUrl') || this.isModified('additionalImages')) {
    try {
      // This would be replaced with actual image processing logic
      this.cloudinaryData.imageAnalysisResults = {
        analyzedAt: new Date(),
        status: 'Pending analysis'
      };
    } catch (error) {
      console.error('Image processing error:', error);
    }
  }
  next();
});

module.exports = mongoose.model('Campaign', CampaignSchema);