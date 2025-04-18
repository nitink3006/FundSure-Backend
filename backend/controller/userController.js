const Donation = require('../models/Donation'); // Your donation model
const Campaign = require('../models/Campaign'); // Your campaign model

exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id; // coming from auth middleware

    // Fetch user donations
    const recentDonations = await Donation.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Fetch user campaigns
    const userCampaigns = await Campaign.find({ createdBy: userId });

    // Example stats (can customize or expand later)
    const stats = {
      totalDonations: recentDonations.length,
      totalCampaigns: userCampaigns.length,
      totalRaised: userCampaigns.reduce((sum, campaign) => sum + (campaign.raisedAmount || 0), 0)
    };

    return res.status(200).json({
      success: true,
      stats,
      recentDonations,
      userCampaigns
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
};
