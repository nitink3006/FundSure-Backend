const express = require('express');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Donation = require('../models/Donation');
const { protect, authorize } = require('../middleware/auth');
const FraudDetectionService = require('../services/fraudDetection');
const { 
  addFraudAnalysis, 
  checkUrgentReview, 
  preventHighRiskApproval, 
  logFraudActivity 
} = require('../middleware/fraudDetection');

const router = express.Router();

// Apply middleware to all routes in this router
router.use(protect);
router.use(authorize('admin'));
router.use(logFraudActivity); // Log all fraud-related activities

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
    
    // Get high-risk pending campaigns
    const pendingCampaigns = await Campaign.find({ status: 'pending' });
    let highRiskPending = 0;
    
    for (const campaign of pendingCampaigns) {
      try {
        const analysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
        if (analysis.fraudScore >= 50) {
          highRiskPending++;
        }
      } catch (error) {
        console.error('Dashboard fraud analysis error:', error);
      }
    }
    
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
        highRiskPending, // NEW: Show high-risk pending campaigns
        campaignsByStatus: groupedCampaigns,
        totalUsers,
        totalDonations,
        monthlyDonations: formattedMonthlyData,
        fraudAlert: highRiskPending > 0 ? `${highRiskPending} high-risk campaigns need attention` : null
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get all campaigns (for admin) - WITH AUTOMATIC FRAUD ANALYSIS
router.get('/campaigns', addFraudAnalysis, async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const search = req.query.search || null;
    const riskLevel = req.query.riskLevel || null; // NEW: Filter by risk level
    
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
    
    let campaigns = await Campaign.find(query)
      .populate('creator', 'name email')
      .sort({ createdAt: -1 });
    
    // Add fraud analysis to each campaign
    const campaignsWithFraudAnalysis = await Promise.all(
      campaigns.map(async (campaign) => {
        const campaignObj = campaign.toObject();
        
        try {
          const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaignObj);
          campaignObj.fraudAnalysis = fraudAnalysis;
          
          // Highlight urgent cases
          if (fraudAnalysis.fraudScore >= 70) {
            campaignObj.urgentReview = true;
          }
          
          return campaignObj;
        } catch (error) {
          console.error('Fraud analysis error for campaign:', campaign._id, error);
          campaignObj.fraudAnalysis = {
            fraudScore: 0,
            riskLevel: 'Unknown',
            indicators: [],
            recommendation: 'Analysis failed - Manual review required'
          };
          return campaignObj;
        }
      })
    );
    
    // Filter by risk level if specified
    let filteredCampaigns = campaignsWithFraudAnalysis;
    if (riskLevel && riskLevel !== 'all') {
      filteredCampaigns = campaignsWithFraudAnalysis.filter(campaign => 
        campaign.fraudAnalysis.riskLevel === riskLevel
      );
    }
    
    // Sort by fraud score (highest first) if filtering by risk
    if (riskLevel && riskLevel !== 'all') {
      filteredCampaigns.sort((a, b) => b.fraudAnalysis.fraudScore - a.fraudAnalysis.fraudScore);
    }
    
    res.status(200).json({
      success: true,
      count: filteredCampaigns.length,
      data: filteredCampaigns,
      fraudSummary: {
        highRisk: campaignsWithFraudAnalysis.filter(c => c.fraudAnalysis.fraudScore >= 50).length,
        mediumRisk: campaignsWithFraudAnalysis.filter(c => c.fraudAnalysis.fraudScore >= 30 && c.fraudAnalysis.fraudScore < 50).length,
        lowRisk: campaignsWithFraudAnalysis.filter(c => c.fraudAnalysis.fraudScore < 30).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single campaign with fraud analysis
router.get('/campaigns/:id', checkUrgentReview, async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('creator', 'name email');
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }
    
    const campaignObj = campaign.toObject();
    
    // Add comprehensive fraud analysis for detailed view
    try {
      const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaignObj);
      campaignObj.fraudAnalysis = fraudAnalysis;
      
      // Add additional context for admin
      campaignObj.adminContext = {
        analysisDate: new Date(),
        needsUrgentReview: fraudAnalysis.fraudScore >= 70,
        canAutoApprove: fraudAnalysis.fraudScore < 30,
        requiresManualReview: fraudAnalysis.fraudScore >= 30 && fraudAnalysis.fraudScore < 70
      };
      
    } catch (error) {
      console.error('Fraud analysis error:', error);
      campaignObj.fraudAnalysis = {
        fraudScore: 0,
        riskLevel: 'Unknown',
        indicators: [],
        recommendation: 'Analysis failed - Manual review required'
      };
    }
    
    res.status(200).json({
      success: true,
      data: campaignObj,
    });
  } catch (error) {
    next(error);
  }
});

// Approve campaign - WITH COMPREHENSIVE FRAUD PROTECTION
router.put('/campaigns/:id/approve', preventHighRiskApproval, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }
    
    // Get fraud analysis (will be in req.fraudAnalysis from middleware)
    const fraudAnalysis = req.fraudAnalysis || await FraudDetectionService.analyzeCampaign(campaign.toObject());
    
    // Extra validation for high-risk campaigns
    if (fraudAnalysis.fraudScore >= 50 && !req.body.adminNote) {
      return res.status(400).json({
        success: false,
        message: 'High-risk campaigns require admin note for approval',
        fraudAnalysis: fraudAnalysis,
        requiredFields: ['adminNote']
      });
    }
    
    // Log the approval decision
    console.log(`CAMPAIGN APPROVAL - ID: ${campaign._id}, Fraud Score: ${fraudAnalysis.fraudScore}, Admin: ${req.user.email}`);
    
    // Calculate new end date
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + campaign.duration);
    
    // Prepare updates with comprehensive fraud data
    const updates = {
      status: 'active',
      isEmergency: req.body.isEmergency || false,
      endDate: newEndDate,
      fraudAnalysisData: {
        analyzedAt: new Date(),
        fraudScore: fraudAnalysis.fraudScore,
        riskLevel: fraudAnalysis.riskLevel,
        indicators: fraudAnalysis.indicators,
        recommendation: fraudAnalysis.recommendation,
        approvedBy: req.user.id,
        approvalNote: req.body.adminNote || req.body.approvalNote || 'Approved by admin',
        forceApproved: req.body.forceApprove || false,
        manualReviewRequired: false
      }
    };

    const approvedCampaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: approvedCampaign,
      fraudAnalysis: fraudAnalysis,
      approvalContext: {
        riskLevel: fraudAnalysis.riskLevel,
        adminDecision: 'Approved',
        timestamp: new Date()
      }
    });
    
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reject campaign with fraud analysis
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
    
    // Get fraud analysis for rejection logging
    const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
    
    // Log the rejection decision
    console.log(`CAMPAIGN REJECTION - ID: ${campaign._id}, Fraud Score: ${fraudAnalysis.fraudScore}, Admin: ${req.user.email}, Reason: ${reason}`);
    
    campaign.status = 'rejected';
    campaign.rejectionReason = reason;
    campaign.fraudAnalysisData = {
      analyzedAt: new Date(),
      fraudScore: fraudAnalysis.fraudScore,
      riskLevel: fraudAnalysis.riskLevel,
      indicators: fraudAnalysis.indicators,
      recommendation: fraudAnalysis.recommendation,
      rejectedBy: req.user.id,
      rejectionNote: reason
    };
    
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign,
      fraudAnalysis: fraudAnalysis,
      rejectionContext: {
        riskLevel: fraudAnalysis.riskLevel,
        adminDecision: 'Rejected',
        timestamp: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

// NEW: Bulk fraud analysis for multiple campaigns
router.post('/campaigns/bulk-fraud-analysis', async (req, res, next) => {
  try {
    const { campaignIds } = req.body;
    
    if (!campaignIds || !Array.isArray(campaignIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of campaign IDs'
      });
    }
    
    const campaigns = await Campaign.find({ _id: { $in: campaignIds } });
    
    const results = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
          return {
            campaignId: campaign._id,
            title: campaign.title,
            status: campaign.status,
            fraudAnalysis: fraudAnalysis
          };
        } catch (error) {
          return {
            campaignId: campaign._id,
            title: campaign.title,
            status: campaign.status,
            fraudAnalysis: {
              fraudScore: 0,
              riskLevel: 'Unknown',
              indicators: [],
              recommendation: 'Analysis failed'
            }
          };
        }
      })
    );
    
    res.status(200).json({
      success: true,
      data: results,
      summary: {
        total: results.length,
        highRisk: results.filter(r => r.fraudAnalysis.fraudScore >= 50).length,
        mediumRisk: results.filter(r => r.fraudAnalysis.fraudScore >= 30 && r.fraudAnalysis.fraudScore < 50).length,
        lowRisk: results.filter(r => r.fraudAnalysis.fraudScore < 30).length
      }
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

// Enhanced fraud statistics
router.get('/fraud-stats', async (req, res, next) => {
  try {
    const campaigns = await Campaign.find({ status: { $in: ['pending', 'active', 'rejected', 'completed'] } });
    
    let stats = {
      total: 0,
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0,
      byCategory: {},
      recentTrends: [],
      riskDistribution: {}
    };
    
    for (const campaign of campaigns) {
      try {
        const analysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
        stats.total++;
        
        // Count by risk level
        if (analysis.fraudScore >= 80) stats.veryHigh++;
        else if (analysis.fraudScore >= 60) stats.high++;
        else if (analysis.fraudScore >= 40) stats.medium++;
        else if (analysis.fraudScore >= 20) stats.low++;
        else stats.veryLow++;
        
        // Count by category
        if (!stats.byCategory[campaign.category]) {
          stats.byCategory[campaign.category] = { total: 0, highRisk: 0 };
        }
        stats.byCategory[campaign.category].total++;
        if (analysis.fraudScore >= 50) {
          stats.byCategory[campaign.category].highRisk++;
        }
        
      } catch (error) {
        console.error('Error in fraud stats:', error);
      }
    }
    
    // Calculate percentages
    if (stats.total > 0) {
      stats.riskDistribution = {
        veryHigh: Math.round((stats.veryHigh / stats.total) * 100),
        high: Math.round((stats.high / stats.total) * 100),
        medium: Math.round((stats.medium / stats.total) * 100),
        low: Math.round((stats.low / stats.total) * 100),
        veryLow: Math.round((stats.veryLow / stats.total) * 100)
      };
    }
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;