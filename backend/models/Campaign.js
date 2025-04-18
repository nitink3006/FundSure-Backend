
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
      'Elderly Care', // New category for old people
      'Child Welfare', // New category for children
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
  imageUrl: [
    {type: String,
    required: [true, 'Please upload a campaign image'],
  }
],
  videos:[
    {
      type: String,
    }
  ],
  documents: [
  {  type: String,
    required: [true, 'Please upload a verification document'],
  }
  ],
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
  rejectionReason: {
    type: String,
  },
  endDate: {
    type: Date,
    required: true,
  },
  updates: [
    {
      title: String,
      content: String,
      date: {
        type: Date,
        default: Date.now,
      },
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
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Calculate days left
CampaignSchema.virtual('daysLeft').get(function () {
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Set toJSON option to include virtuals
CampaignSchema.set('toJSON', { virtuals: true });
CampaignSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Campaign', CampaignSchema);
