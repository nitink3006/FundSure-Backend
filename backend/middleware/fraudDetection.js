// middleware/fraudDetection.js

const FraudDetectionService = require('../services/fraudDetection');
const Campaign = require('../models/Campaign');

// Middleware to add fraud analysis to campaigns automatically
const addFraudAnalysis = async (req, res, next) => {
  try {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method
    res.json = async function(data) {
      // Only process if this is a campaign response and user is admin
      if (req.user && req.user.role === 'admin' && data.data) {
        try {
          // Handle single campaign
          if (data.data._id && data.data.title) {
            const fraudAnalysis = await FraudDetectionService.analyzeCampaign(data.data);
            data.data.fraudAnalysis = fraudAnalysis;
          }
          // Handle array of campaigns
          else if (Array.isArray(data.data)) {
            data.data = await Promise.all(
              data.data.map(async (campaign) => {
                if (campaign._id && campaign.title) {
                  try {
                    const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaign);
                    campaign.fraudAnalysis = fraudAnalysis;
                    return campaign;
                  } catch (error) {
                    console.error('Fraud analysis error for campaign:', campaign._id, error);
                    campaign.fraudAnalysis = {
                      fraudScore: 0,
                      riskLevel: 'Unknown',
                      indicators: [],
                      recommendation: 'Analysis failed'
                    };
                    return campaign;
                  }
                }
                return campaign;
              })
            );
          }
        } catch (error) {
          console.error('Fraud analysis middleware error:', error);
          // Continue without fraud analysis if there's an error
        }
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  } catch (error) {
    console.error('Fraud middleware setup error:', error);
    next();
  }
};

// Middleware to check if campaign needs urgent review based on fraud score
const checkUrgentReview = async (req, res, next) => {
  try {
    if (req.params.id) {
      const campaign = await Campaign.findById(req.params.id);
      
      if (campaign && campaign.status === 'pending') {
        const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
        
        // Mark for urgent review if fraud score is high
        if (fraudAnalysis.fraudScore >= 70) {
          // You can add notification logic here
          console.warn(`HIGH FRAUD RISK DETECTED: Campaign ${campaign._id} - Score: ${fraudAnalysis.fraudScore}`);
          
          // Optionally update campaign with urgent review flag
          await Campaign.findByIdAndUpdate(campaign._id, {
            'fraudAnalysisData.manualReviewRequired': true,
            'fraudAnalysisData.analyzedAt': new Date(),
            'fraudAnalysisData.fraudScore': fraudAnalysis.fraudScore,
            'fraudAnalysisData.riskLevel': fraudAnalysis.riskLevel
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Urgent review check error:', error);
    next();
  }
};

// Middleware to prevent approval of high-risk campaigns without explicit override
const preventHighRiskApproval = async (req, res, next) => {
  try {
    if (req.params.id && req.route.path.includes('approve')) {
      const campaign = await Campaign.findById(req.params.id);
      
      if (campaign) {
        const fraudAnalysis = await FraudDetectionService.analyzeCampaign(campaign.toObject());
        
        // Block approval if fraud score is very high and no override is provided
        if (fraudAnalysis.fraudScore >= 80 && !req.body.forceApprove) {
          return res.status(400).json({
            success: false,
            message: 'Cannot approve campaign with very high fraud risk',
            fraudAnalysis: fraudAnalysis,
            requiresOverride: true,
            overrideMessage: 'To approve this campaign, add "forceApprove": true to your request body and provide a detailed reason.'
          });
        }
        
        // Warn about high risk campaigns
        if (fraudAnalysis.fraudScore >= 50 && fraudAnalysis.fraudScore < 80) {
          console.warn(`WARNING: Approving high-risk campaign ${campaign._id} - Score: ${fraudAnalysis.fraudScore}`);
        }
        
        // Store fraud analysis in request for use in route handler
        req.fraudAnalysis = fraudAnalysis;
      }
    }
    
    next();
  } catch (error) {
    console.error('High risk approval prevention error:', error);
    next();
  }
};

// Middleware to log all fraud analysis activities
const logFraudActivity = async (req, res, next) => {
  try {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Override response methods to log after response
    const logActivity = (data) => {
      if (req.user && req.user.role === 'admin' && req.params.id) {
        const activity = {
          timestamp: new Date(),
          adminId: req.user.id,
          adminEmail: req.user.email,
          campaignId: req.params.id,
          action: req.method + ' ' + req.route.path,
          fraudScore: req.fraudAnalysis ? req.fraudAnalysis.fraudScore : null,
          riskLevel: req.fraudAnalysis ? req.fraudAnalysis.riskLevel : null
        };
        
        // Log to console (you can replace this with proper logging service)
        console.log('FRAUD ACTIVITY LOG:', JSON.stringify(activity, null, 2));
        
        // You can store this in a separate FraudLog collection if needed
      }
    };
    
    res.json = function(data) {
      logActivity(data);
      return originalJson.call(this, data);
    };
    
    res.send = function(data) {
      logActivity(data);
      return originalSend.call(this, data);
    };
    
    next();
  } catch (error) {
    console.error('Fraud activity logging error:', error);
    next();
  }
};

module.exports = {
  addFraudAnalysis,
  checkUrgentReview,
  preventHighRiskApproval,
  logFraudActivity
};