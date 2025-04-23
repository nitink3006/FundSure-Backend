
const express = require('express');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Donation = require('../models/Donation');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all routes in this router
router.use(protect);
router.use(authorize('admin'));

// Get dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {

    const allCampaigns = await Campaign.find();

    const groupedCampaigns = allCampaigns.reduce((acc, campaign) => {
      const status = campaign.status || 'unknown'; 
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(campaign);
      return acc;
    }, {});

    // Get total campaigns
    const totalCampaigns = await Campaign.countDocuments();
    
    // Get pending approvals
    const pendingApprovals = await Campaign.countDocuments({ status: 'pending' });
    
    // Get total users
    const totalUsers = await User.countDocuments();
    
    // Get total donations
    const donations = await Donation.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    
    const totalDonations = donations.length > 0 ? donations[0].total : 0;
    
    // Get monthly donation data for current year
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);
    
    const monthlyDonations = await Donation.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          total: { $sum: '$amount' },
        },
      },
      {
        $sort: { '_id.month': 1 },
      },
    ]);
    
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    
    const formattedMonthlyData = months.map((month, index) => {
      const monthData = monthlyDonations.find(item => item._id.month === index + 1);
      return {
        month,
        donations: monthData ? monthData.total : 0,
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalCampaigns,
        pendingApprovals,
        campaignsByStatus: groupedCampaigns,
        totalUsers,
        totalDonations,
        monthlyDonations: formattedMonthlyData,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get all campaigns (for admin)
router.get('/campaigns', async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const search = req.query.search || null;
    
    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    const campaigns = await Campaign.find(query)
      .populate('creator', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});

// Approve campaign
router.put('/campaigns/:id/approve', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }
    
    if (campaign.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not pending approval',
      });
    }
    
    campaign.status = 'active';
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

// Reject campaign
router.put('/campaigns/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }
    
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }
    
    if (campaign.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not pending approval',
      });
    }
    
    campaign.status = 'rejected';
    campaign.rejectionReason = reason;
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

// Get all users (for admin)
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
