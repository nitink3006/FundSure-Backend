
// const express = require('express');
// const Donation = require('../models/Donation');
// const Campaign = require('../models/Campaign');
// const { protect } = require('../middleware/auth');
// const { processPayment } = require('../middleware/payment');

// const router = express.Router();

// // Create donation
// router.post('/', protect, async (req, res, next) => {
//   try {
//     const { campaignId, amount } = req.body;

//     // Validate amount
//     if (!amount || amount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Please provide a valid donation amount',
//       });
//     }

//     // Check if campaign exists and is active
//     const campaign = await Campaign.findById(campaignId);
//     if (!campaign) {
//       return res.status(404).json({
//         success: false,
//         message: 'Campaign not found',
//       });
//     }

//     if (campaign.status !== 'active') {
//       return res.status(400).json({
//         success: false,
//         message: 'This campaign is not currently active',
//       });
//     }

//     // Process payment
//     const paymentResult = await processPayment(req.body);
    
//     if (!paymentResult.success) {
//       return res.status(400).json({
//         success: false,
//         message: paymentResult.message || 'Payment processing failed',
//       });
//     }

//     // Create donation record
//     const donation = await Donation.create({
//       campaign: campaignId,
//       donor: req.user.id,
//       amount,
//       status: 'completed',
//       paymentId: paymentResult.paymentId,
//     });

//     res.status(201).json({
//       success: true,
//       data: donation,
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// // Get user's donations
// router.get('/', protect, async (req, res, next) => {
//   try {
//     const donations = await Donation.find({ donor: req.user.id })
//       .populate({
//         path: 'campaign',
//         select: 'title imageUrl',
//       })
//       .sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       count: donations.length,
//       data: donations,
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// // Get donation by ID
// router.get('/:id', protect, async (req, res, next) => {
//   try {
//     const donation = await Donation.findById(req.params.id)
//       .populate({
//         path: 'campaign',
//         select: 'title description imageUrl goalAmount raisedAmount status',
//       });

//     if (!donation) {
//       return res.status(404).json({
//         success: false,
//         message: 'Donation not found',
//       });
//     }

//     // Check if user owns this donation
//     if (donation.donor.toString() !== req.user.id) {
//       return res.status(403).json({
//         success: false,
//         message: 'Not authorized to access this donation',
//       });
//     }

//     res.status(200).json({
//       success: true,
//       data: donation,
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// // Get user's donation stats
// router.get('/stats/summary', protect, async (req, res, next) => {
//   try {
//     // Get total donated amount
//     const totalDonated = await Donation.aggregate([
//       { $match: { donor: req.user._id, status: 'completed' } },
//       { $group: { _id: null, total: { $sum: '$amount' } } },
//     ]);

//     // Get count of campaigns supported
//     const campaignsSupported = await Donation.distinct('campaign', {
//       donor: req.user._id,
//       status: 'completed',
//     });

//     res.status(200).json({
//       success: true,
//       data: {
//         totalDonated: totalDonated.length > 0 ? totalDonated[0].total : 0,
//         campaignsSupported: campaignsSupported.length,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// module.exports = router;


const express = require('express');
const Donation = require('../models/Donation');
const Campaign = require('../models/Campaign');
const { protect } = require('../middleware/auth');
const { processPayment, createPaymentIntent } = require('../middleware/payment');

const router = express.Router();

// Create donation
router.post('/', protect, async (req, res, next) => {
  try {
    const { campaignId, amount } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid donation amount',
      });
    }

    // Check if campaign exists and is active
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This campaign is not currently active',
      });
    }

    // Process payment with fake payment system
    const paymentResult = await processPayment(req.body);
    
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: paymentResult.message || 'Payment processing failed',
      });
    }

    // Create donation record
    const donation = await Donation.create({
      campaign: campaignId,
      donor: req.user.id,
      amount,
      status: 'completed',
      paymentId: paymentResult.paymentId,
    });

    res.status(201).json({
      success: true,
      data: donation,
      paymentDetails: paymentResult.clientSecret ? { clientSecret: paymentResult.clientSecret } : null
    });
  } catch (error) {
    next(error);
  }
});

// Create payment intent for client-side payment processing
router.post('/create-payment-intent', protect, async (req, res, next) => {
  try {
    const { campaignId, amount } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid donation amount',
      });
    }
    
    // Check if campaign exists and is active
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This campaign is not currently active',
      });
    }
    
    // Create a fake payment intent
    const paymentIntent = await createPaymentIntent(amount, {
      campaignId: campaign._id.toString(),
      campaignTitle: campaign.title,
      userId: req.user.id
    });
    
    if (!paymentIntent.success) {
      return res.status(400).json({
        success: false,
        message: paymentIntent.message || 'Failed to create payment intent',
      });
    }
    
    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.clientSecret,
    });
  } catch (error) {
    next(error);
  }
});



module.exports = router;
