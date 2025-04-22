const Donation = require('../models/Donation');
const Campaign = require('../models/Campaign');

exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id; // coming from auth middleware

    // Fetch user donations
    const recentDonations = await Donation.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Fetch all user campaigns with full details
    const userCampaigns = await Campaign.find({ creator: userId });

    // Group campaigns by status
    const activeCampaigns = userCampaigns.filter(campaign => campaign.status === 'active');
    const pendingCampaigns = userCampaigns.filter(campaign => campaign.status === 'pending');
    const completedCampaigns = userCampaigns.filter(campaign => campaign.status === 'completed');
    const rejectedCampaigns = userCampaigns.filter(campaign => campaign.status === 'rejected');

    // Calculate statistics
    const stats = {
      totalDonations: recentDonations.length,
      totalCampaigns: userCampaigns.length,
      activeCampaigns: activeCampaigns.length,
      pendingCampaigns: pendingCampaigns.length,
      completedCampaigns: completedCampaigns.length,
      rejectedCampaigns: rejectedCampaigns.length,
      totalRaised: userCampaigns.reduce((sum, campaign) => sum + (campaign.raisedAmount || 0), 0)
    };

    return res.status(200).json({
      success: true,
      stats,
      recentDonations,
      campaigns: {
        all: userCampaigns,
        active: activeCampaigns,
        pending: pendingCampaigns,
        completed: completedCampaigns,
        rejected: rejectedCampaigns
      }
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
};