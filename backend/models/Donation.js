
const mongoose = require('mongoose');

const DonationSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: [true, 'Please provide donation amount'],
    min: [1, 'Donation amount must be at least $1'],
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  paymentId: {
    type: String,
  },
  receipt: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Generate receipt number
DonationSchema.pre('save', function (next) {
  if (!this.receipt) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    this.receipt = `REC-${randomNum}`;
  }
  next();
});

// Update campaign raised amount and backers count
DonationSchema.post('save', async function () {
  if (this.status === 'completed') {
    try {
      const Campaign = mongoose.model('Campaign');
      await Campaign.findByIdAndUpdate(this.campaign, {
        $inc: {
          raisedAmount: this.amount,
          backers: 1,
        },
      });
    } catch (error) {
      console.error('Error updating campaign after donation:', error);
    }
  }
});

module.exports = mongoose.model('Donation', DonationSchema);
