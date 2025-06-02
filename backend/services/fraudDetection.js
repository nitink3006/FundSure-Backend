// services/fraudDetection.js

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');

class FraudDetectionService {
  
  // Main fraud detection function
  static async analyzeCampaign(campaignData) {
    try {
      const fraudScore = await this.calculateFraudScore(campaignData);
      const fraudIndicators = await this.getFraudIndicators(campaignData);
      
      return {
        fraudScore: Math.round(fraudScore),
        riskLevel: this.getRiskLevel(fraudScore),
        indicators: fraudIndicators,
        recommendation: this.getRecommendation(fraudScore)
      };
    } catch (error) {
      console.error('Fraud detection error:', error);
      return {
        fraudScore: 0,
        riskLevel: 'Unknown',
        indicators: [],
        recommendation: 'Manual review required - analysis failed'
      };
    }
  }

  // Calculate overall fraud score (0-100)
  static async calculateFraudScore(campaign) {
    let score = 0;
    
    // Title analysis (25% weightage)
    score += await this.analyzeTitleFraud(campaign.title) * 0.25;
    
    // Description analysis (20% weightage)
    score += this.analyzeDescriptionFraud(campaign.description) * 0.20;
    
    // Story analysis (20% weightage)
    score += this.analyzeStoryFraud(campaign.story) * 0.20;
    
    // Amount analysis (15% weightage)
    score += this.analyzeAmountFraud(campaign.goalAmount, campaign.category) * 0.15;
    
    // Creator history analysis (10% weightage)
    score += await this.analyzeCreatorHistory(campaign.creator) * 0.10;
    
    // Pattern analysis (10% weightage)
    score += await this.analyzePatterns(campaign) * 0.10;
    
    return Math.min(score, 100);
  }

  // Analyze title for fraud indicators
  static async analyzeTitleFraud(title) {
    let score = 0;
    
    const suspiciousWords = [
      'urgent', 'emergency', 'dying', 'last chance', 'help me please',
      'scam', 'fake', 'immediate', 'desperate', 'bankruptcy',
      'guaranteed', 'easy money', 'get rich', 'investment opportunity'
    ];
    
    const emotionalWords = [
      'please help', 'save me', 'dying', 'cancer', 'accident',
      'tragedy', 'victim', 'homeless', 'starving'
    ];
    
    const titleLower = title.toLowerCase();
    
    // Check for suspicious words
    suspiciousWords.forEach(word => {
      if (titleLower.includes(word)) {
        score += 15;
      }
    });
    
    // Check for excessive emotional appeal
    let emotionalCount = 0;
    emotionalWords.forEach(word => {
      if (titleLower.includes(word)) {
        emotionalCount++;
      }
    });
    
    if (emotionalCount > 2) {
      score += 20;
    }
    
    // Check for excessive capitalization
    const capsCount = (title.match(/[A-Z]/g) || []).length;
    const capsRatio = capsCount / title.length;
    if (capsRatio > 0.3) {
      score += 15;
    }
    
    // Check for excessive punctuation
    const punctCount = (title.match(/[!?]{2,}/g) || []).length;
    if (punctCount > 0) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }

  // Analyze description for fraud indicators
  static analyzeDescriptionFraud(description) {
    let score = 0;
    
    const descLower = description.toLowerCase();
    
    // Check for common fraud phrases
    const fraudPhrases = [
      'send money', 'wire transfer', 'paypal only', 'cash only',
      'no questions asked', 'trust me', 'guaranteed return',
      'act fast', 'limited time', 'secret method'
    ];
    
    fraudPhrases.forEach(phrase => {
      if (descLower.includes(phrase)) {
        score += 20;
      }
    });
    
    // Check for vague descriptions
    if (description.length < 50) {
      score += 15;
    }
    
    // Check for excessive repetition
    const words = description.split(' ');
    const wordCount = {};
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      if (cleanWord.length > 3) {
        wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
      }
    });
    
    const maxRepetition = Math.max(...Object.values(wordCount));
    if (maxRepetition > 5) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }

  // Analyze story for fraud indicators
  static analyzeStoryFraud(story) {
    let score = 0;
    
    const storyLower = story.toLowerCase();
    
    // Check story length
    if (story.length < 200) {
      score += 15;
    } else if (story.length > 5000) {
      score += 10;
    }
    
    // Check for inconsistencies (basic patterns)
    const sentences = story.split(/[.!?]+/);
    const shortSentences = sentences.filter(s => s.trim().length < 20).length;
    const longSentences = sentences.filter(s => s.trim().length > 200).length;
    
    if (shortSentences / sentences.length > 0.7) {
      score += 10; // Too many short sentences
    }
    
    if (longSentences > 0) {
      score += 5; // Very long sentences can be copy-paste
    }
    
    // Check for copied content patterns
    const commonPhrases = [
      'copy and paste', 'share this post', 'forward this message',
      'please share', 'viral post', 'true story'
    ];
    
    commonPhrases.forEach(phrase => {
      if (storyLower.includes(phrase)) {
        score += 25;
      }
    });
    
    return Math.min(score, 100);
  }

  // Analyze goal amount for reasonableness
  static analyzeAmountFraud(goalAmount, category) {
    let score = 0;
    
    // Define reasonable amount ranges by category
    const categoryLimits = {
      'Education': { min: 1000, max: 100000 },
      'Medical': { min: 5000, max: 500000 },
      'Environment': { min: 2000, max: 200000 },
      'Animal Welfare': { min: 500, max: 50000 },
      'Disaster Relief': { min: 10000, max: 1000000 },
      'Sports': { min: 1000, max: 100000 },
      'Elderly Care': { min: 2000, max: 150000 },
      'Child Welfare': { min: 1000, max: 100000 }
    };
    
    const limits = categoryLimits[category] || { min: 1000, max: 100000 };
    
    // Check if amount is unreasonably high
    if (goalAmount > limits.max * 2) {
      score += 30;
    } else if (goalAmount > limits.max) {
      score += 15;
    }
    
    // Check if amount is suspiciously low
    if (goalAmount < limits.min / 2) {
      score += 20;
    }
    
    // Check for round numbers (often fake)
    if (goalAmount % 10000 === 0 && goalAmount > 50000) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }

  // Analyze creator's history
  static async analyzeCreatorHistory(creatorId) {
    try {
      let score = 0;
      
      // Get creator's previous campaigns
      const previousCampaigns = await Campaign.find({ creator: creatorId });
      
      if (previousCampaigns.length === 0) {
        // New user - moderate risk
        score += 20;
      } else {
        // Check success rate
        const rejectedCampaigns = previousCampaigns.filter(c => c.status === 'rejected').length;
        const rejectionRate = rejectedCampaigns / previousCampaigns.length;
        
        if (rejectionRate > 0.5) {
          score += 40;
        } else if (rejectionRate > 0.3) {
          score += 25;
        }
        
        // Check for too many campaigns in short time
        const recentCampaigns = previousCampaigns.filter(c => {
          const daysDiff = (new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24);
          return daysDiff < 30;
        });
        
        if (recentCampaigns.length > 3) {
          score += 20;
        }
        
        // Check completion rate
        const completedCampaigns = previousCampaigns.filter(c => c.status === 'completed').length;
        const activeCampaigns = previousCampaigns.filter(c => c.status === 'active').length;
        const completionRate = completedCampaigns / (completedCampaigns + activeCampaigns);
        
        if (completionRate < 0.3 && previousCampaigns.length > 2) {
          score += 15;
        }
      }
      
      return Math.min(score, 100);
    } catch (error) {
      console.error('Creator history analysis error:', error);
      return 10; // Default moderate risk for errors
    }
  }

  // Analyze patterns across similar campaigns
  static async analyzePatterns(campaign) {
    try {
      let score = 0;
      
      // Check for similar campaigns in same category
      const similarCampaigns = await Campaign.find({
        category: campaign.category,
        creator: { $ne: campaign.creator },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });
      
      // Check for title similarity
      const titleWords = campaign.title.toLowerCase().split(' ');
      similarCampaigns.forEach(similarCampaign => {
        const similarWords = similarCampaign.title.toLowerCase().split(' ');
        const commonWords = titleWords.filter(word => 
          word.length > 3 && similarWords.includes(word)
        );
        
        if (commonWords.length > titleWords.length * 0.5) {
          score += 15;
        }
      });
      
      // Check for description similarity (basic)
      const descWords = campaign.description.toLowerCase().split(' ');
      similarCampaigns.forEach(similarCampaign => {
        const similarDescWords = similarCampaign.description.toLowerCase().split(' ');
        const commonDescWords = descWords.filter(word => 
          word.length > 4 && similarDescWords.includes(word)
        );
        
        if (commonDescWords.length > descWords.length * 0.3) {
          score += 20;
        }
      });
      
      return Math.min(score, 100);
    } catch (error) {
      console.error('Pattern analysis error:', error);
      return 5;
    }
  }

  // Get detailed fraud indicators
  static async getFraudIndicators(campaign) {
    const indicators = [];
    
    // Title indicators
    const titleScore = await this.analyzeTitleFraud(campaign.title);
    if (titleScore > 20) {
      indicators.push({
        type: 'Title',
        severity: titleScore > 50 ? 'High' : 'Medium',
        description: 'Title contains suspicious or overly emotional language'
      });
    }
    
    // Description indicators
    const descScore = this.analyzeDescriptionFraud(campaign.description);
    if (descScore > 15) {
      indicators.push({
        type: 'Description',
        severity: descScore > 40 ? 'High' : 'Medium',
        description: 'Description contains fraud-related phrases or is too vague'
      });
    }
    
    // Amount indicators
    const amountScore = this.analyzeAmountFraud(campaign.goalAmount, campaign.category);
    if (amountScore > 15) {
      indicators.push({
        type: 'Goal Amount',
        severity: amountScore > 30 ? 'High' : 'Medium',
        description: 'Goal amount seems unreasonable for the campaign category'
      });
    }
    
    // Story indicators
    const storyScore = this.analyzeStoryFraud(campaign.story);
    if (storyScore > 15) {
      indicators.push({
        type: 'Story',
        severity: storyScore > 35 ? 'High' : 'Medium',
        description: 'Story shows signs of being copied or fabricated'
      });
    }
    
    // Creator indicators
    const creatorScore = await this.analyzeCreatorHistory(campaign.creator);
    if (creatorScore > 25) {
      indicators.push({
        type: 'Creator History',
        severity: creatorScore > 50 ? 'High' : 'Medium',
        description: 'Creator has concerning campaign history or is new'
      });
    }
    
    return indicators;
  }

  // Get risk level based on fraud score
  static getRiskLevel(score) {
    if (score >= 70) return 'Very High';
    if (score >= 50) return 'High';
    if (score >= 30) return 'Medium';
    if (score >= 15) return 'Low';
    return 'Very Low';
  }

  // Get recommendation based on fraud score
  static getRecommendation(score) {
    if (score >= 70) {
      return 'REJECT - High fraud probability detected';
    } else if (score >= 50) {
      return 'MANUAL REVIEW REQUIRED - Multiple fraud indicators found';
    } else if (score >= 30) {
      return 'PROCEED WITH CAUTION - Some suspicious elements detected';
    } else if (score >= 15) {
      return 'REVIEW RECOMMENDED - Minor concerns identified';
    } else {
      return 'APPROVE - Low fraud risk detected';
    }
  }
}

module.exports = FraudDetectionService;