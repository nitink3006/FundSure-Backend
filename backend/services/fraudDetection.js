const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');

class FraudDetectionService {
  
  // Main fraud detection function
  static async analyzeCampaign(campaignData) {
    try {
      const fraudScore = await this.calculateFraudScore(campaignData);
      const fraudIndicators = await this.getFraudIndicators(campaignData);
      const riskFactors = await this.getDetailedRiskFactors(campaignData);
      
      return {
        fraudScore: Math.round(fraudScore),
        riskLevel: this.getRiskLevel(fraudScore),
        indicators: fraudIndicators,
        riskFactors: riskFactors,
        recommendation: this.getRecommendation(fraudScore),
        needsManualReview: fraudScore >= 25,
        autoApprove: fraudScore < 12,
        confidence: this.getConfidenceLevel(fraudScore, fraudIndicators.length)
      };
    } catch (error) {
      console.error('Fraud detection error:', error);
      return {
        fraudScore: 50, // Default to medium risk on error
        riskLevel: 'Unknown',
        indicators: [],
        riskFactors: [],
        recommendation: 'MANUAL REVIEW REQUIRED - Analysis failed',
        needsManualReview: true,
        autoApprove: false,
        confidence: 'Low'
      };
    }
  }

  // Enhanced fraud score calculation with optimized sensitivity
  static async calculateFraudScore(campaign) {
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    const weights = {
      title: 0.25,        // 25% - Title analysis (increased)
      description: 0.20,  // 20% - Description analysis  
      story: 0.20,        // 20% - Story analysis
      amount: 0.15,       // 15% - Amount analysis
      creator: 0.12,      // 12% - Creator history
      patterns: 0.08      // 8% - Pattern analysis
    };
    
    // Calculate individual scores
    const titleScore = await this.analyzeTitleFraud(campaign.title);
    const descScore = this.analyzeDescriptionFraud(campaign.description);
    const storyScore = await this.analyzeStoryFraud(campaign.story);
    const amountScore = this.analyzeAmountFraud(campaign.goalAmount, campaign.category);
    const creatorScore = await this.analyzeCreatorHistory(campaign.creator);
    const patternScore = await this.analyzePatterns(campaign);
    
    // Apply weights and calculate final score
    totalScore += titleScore * weights.title;
    totalScore += descScore * weights.description;
    totalScore += storyScore * weights.story;
    totalScore += amountScore * weights.amount;
    totalScore += creatorScore * weights.creator;
    totalScore += patternScore * weights.patterns;
    
    // Apply base risk factor - every campaign starts with minimum risk
    const baseRisk = 5;
    totalScore += baseRisk;
    
    // Apply amplification for multiple risk factors
    const riskFactors = [titleScore, descScore, storyScore, amountScore, creatorScore, patternScore];
    const significantRisks = riskFactors.filter(score => score > 20).length;
    
    if (significantRisks >= 3) {
      totalScore *= 1.3; // 30% amplification for multiple risks
    } else if (significantRisks >= 2) {
      totalScore *= 1.15; // 15% amplification for two risks
    }
    
    // Ensure minimum scores for concerning patterns
    if (titleScore > 30 || descScore > 30) {
      totalScore = Math.max(totalScore, 35);
    }
    
    if (storyScore > 25 && (titleScore > 15 || descScore > 15)) {
      totalScore = Math.max(totalScore, 30);
    }
    
    return Math.min(totalScore, 100);
  }

  // Enhanced title analysis with optimized scoring
  static async analyzeTitleFraud(title) {
    let score = 0;
    const titleLower = title.toLowerCase();
    
    // Critical fraud keywords (immediate high scores)
    const criticalWords = [
      'guaranteed money', 'easy cash', 'investment opportunity', 'get rich quick',
      'wire transfer', 'paypal only', 'no questions asked', 'act fast',
      'limited time offer', 'secret method', 'exclusive deal', 'make money fast'
    ];
    
    // High-risk suspicious words
    const highRiskWords = [
      'urgent', 'emergency', 'immediate', 'desperate', 'bankruptcy',
      'last chance', 'dying', 'save me', 'help me please'
    ];
    
    // Medium-risk emotional words
    const emotionalWords = [
      'please help', 'cancer', 'accident', 'tragedy', 'victim', 
      'homeless', 'starving', 'abandoned', 'orphan'
    ];
    
    // Critical words get maximum penalty
    criticalWords.forEach(word => {
      if (titleLower.includes(word)) {
        score += 40;
      }
    });
    
    // High-risk words
    highRiskWords.forEach(word => {
      if (titleLower.includes(word)) {
        score += 25;
      }
    });
    
    // Emotional manipulation check
    let emotionalCount = 0;
    emotionalWords.forEach(word => {
      if (titleLower.includes(word)) {
        emotionalCount++;
      }
    });
    
    if (emotionalCount > 2) {
      score += 20; // Multiple emotional appeals
    } else if (emotionalCount > 0) {
      score += 8; // Some emotional appeal
    }
    
    // Capitalization analysis
    const capsCount = (title.match(/[A-Z]/g) || []).length;
    const capsRatio = capsCount / title.length;
    if (capsRatio > 0.5 && title.length > 10) {
      score += 20; // Excessive caps
    } else if (capsRatio > 0.3) {
      score += 12;
    } else if (capsRatio > 0.2) {
      score += 6;
    }
    
    // Punctuation analysis
    const excessivePunct = (title.match(/[!?]{3,}/g) || []).length;
    const multiplePunct = (title.match(/[!?]{2}/g) || []).length;
    if (excessivePunct > 0) {
      score += 15;
    } else if (multiplePunct > 1) {
      score += 10;
    } else if (multiplePunct > 0) {
      score += 5;
    }
    
    // Length analysis
    if (title.length < 10) {
      score += 15; // Too vague
    } else if (title.length > 200) {
      score += 12; // Possibly spam
    }
    
    // Scam pattern detection
    const scamPatterns = [
      /need \$?\d+.*urgent/i,
      /help.*\$?\d+.*emergency/i,
      /please.*send.*money/i,
      /donate.*save.*life/i,
      /only.*\$?\d+.*left/i
    ];
    
    scamPatterns.forEach(pattern => {
      if (pattern.test(title)) {
        score += 18;
      }
    });
    
    return Math.min(score, 100);
  }

  // Enhanced description analysis
  static analyzeDescriptionFraud(description) {
    let score = 0;
    const descLower = description.toLowerCase();
    
    // High-risk fraud phrases
    const fraudPhrases = [
      'send money', 'wire transfer', 'paypal only', 'cash only',
      'no questions asked', 'trust me', 'guaranteed return',
      'act fast', 'limited time', 'secret method', 'exclusive opportunity',
      'contact me privately', 'send to my account', 'western union'
    ];
    
    // Financial request patterns
    const financialPatterns = [
      /send.*\$?\d+/i,
      /paypal.*[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
      /bank.*account.*\d+/i,
      /donate.*directly/i
    ];
    
    // Check fraud phrases
    fraudPhrases.forEach(phrase => {
      if (descLower.includes(phrase)) {
        score += 25;
      }
    });
    
    // Check financial patterns
    financialPatterns.forEach(pattern => {
      if (pattern.test(description)) {
        score += 30;
      }
    });
    
    // Description length analysis
    if (description.length < 50) {
      score += 20; // Too vague
    } else if (description.length < 100) {
      score += 10; // Possibly insufficient detail
    }
    
    // Check for excessive repetition
    const words = description.split(/\s+/);
    const wordCount = {};
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      if (cleanWord.length > 3) {
        wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
      }
    });
    
    const maxRepetition = Math.max(...Object.values(wordCount));
    const totalUniqueWords = Object.keys(wordCount).length;
    
    if (maxRepetition > 8) {
      score += 20; // Excessive repetition
    } else if (maxRepetition > 5) {
      score += 10;
    }
    
    // Check word diversity (low diversity might indicate copy-paste)
    const diversityRatio = totalUniqueWords / words.length;
    if (diversityRatio < 0.3 && words.length > 50) {
      score += 15;
    }
    
    // Check for generic templates
    const genericPhrases = [
      'copy and paste', 'share this post', 'forward this message',
      'please share', 'viral post', 'help us reach', 'spread the word'
    ];
    
    genericPhrases.forEach(phrase => {
      if (descLower.includes(phrase)) {
        score += 20;
      }
    });
    
    return Math.min(score, 100);
  }

  // Enhanced story analysis with AI-like text detection
  static async analyzeStoryFraud(story) {
    let score = 0;
    const storyLower = story.toLowerCase();
    
    // Story length analysis
    if (story.length < 200) {
      score += 20; // Too short for compelling story
    } else if (story.length > 5000) {
      score += 15; // Possibly copied content
    }
    
    // Sentence structure analysis
    const sentences = story.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 50; // No proper sentences
    
    const avgSentenceLength = story.length / sentences.length;
    const shortSentences = sentences.filter(s => s.trim().length < 15).length;
    const longSentences = sentences.filter(s => s.trim().length > 300).length;
    const sentenceRatio = shortSentences / sentences.length;
    
    if (sentenceRatio > 0.8) {
      score += 15; // Too many very short sentences
    }
    
    if (longSentences > sentences.length * 0.3) {
      score += 15; // Too many extremely long sentences
    }
    
    // Check for inconsistent writing style
    const firstHalf = story.substring(0, story.length / 2);
    const secondHalf = story.substring(story.length / 2);
    
    const firstHalfAvgLength = firstHalf.split(/\s+/).reduce((a, b) => a + b.length, 0) / firstHalf.split(/\s+/).length;
    const secondHalfAvgLength = secondHalf.split(/\s+/).reduce((a, b) => a + b.length, 0) / secondHalf.split(/\s+/).length;
    
    if (Math.abs(firstHalfAvgLength - secondHalfAvgLength) > 3) {
      score += 10; // Inconsistent writing style
    }
    
    // Check for copied content patterns
    const copiedPatterns = [
      'copy and paste', 'share this post', 'forward this message',
      'please share', 'viral post', 'true story', 'this really happened',
      'based on true events', 'repost if you care'
    ];
    
    copiedPatterns.forEach(pattern => {
      if (storyLower.includes(pattern)) {
        score += 30;
      }
    });
    
    // Check for timeline inconsistencies
    const timeWords = story.match(/\b(yesterday|today|last week|last month|years? ago|months? ago|days? ago)\b/gi) || [];
    if (timeWords.length > 5) {
      score += 10; // Too many time references might indicate fabrication
    }
    
    // Check for emotional manipulation patterns
    const manipulationPatterns = [
      /please.*help.*dying/i,
      /only.*\$?\d+.*save/i,
      /time.*running.*out/i,
      /last.*chance/i,
      /desperate.*need/i
    ];
    
    manipulationPatterns.forEach(pattern => {
      if (pattern.test(story)) {
        score += 15;
      }
    });
    
    // Check paragraph structure
    const paragraphs = story.split(/\n\s*\n/);
    if (paragraphs.length === 1 && story.length > 1000) {
      score += 10; // Wall of text without proper formatting
    }
    
    return Math.min(score, 100);
  }

  // Enhanced amount analysis with category-specific logic
  static analyzeAmountFraud(goalAmount, category) {
    let score = 0;
    
    // Enhanced category limits with more realistic ranges
    const categoryLimits = {
      'Education': { min: 500, max: 150000, typical: 25000 },
      'Medical': { min: 1000, max: 750000, typical: 50000 },
      'Environment': { min: 1000, max: 300000, typical: 15000 },
      'Animal Welfare': { min: 200, max: 75000, typical: 5000 },
      'Disaster Relief': { min: 5000, max: 2000000, typical: 100000 },
      'Sports': { min: 500, max: 200000, typical: 15000 },
      'Elderly Care': { min: 1000, max: 200000, typical: 20000 },
      'Child Welfare': { min: 500, max: 150000, typical: 10000 },
      'Community': { min: 1000, max: 100000, typical: 15000 },
      'Arts': { min: 500, max: 100000, typical: 8000 }
    };
    
    const limits = categoryLimits[category] || { min: 1000, max: 100000, typical: 20000 };
    
    // Extremely high amounts
    if (goalAmount > limits.max * 3) {
      score += 40; // Unrealistically high
    } else if (goalAmount > limits.max * 1.5) {
      score += 25; // Very high
    } else if (goalAmount > limits.max) {
      score += 15; // Above typical max
    }
    
    // Suspiciously low amounts
    if (goalAmount < limits.min / 3) {
      score += 25; // Unrealistically low
    } else if (goalAmount < limits.min) {
      score += 15; // Below typical minimum
    }
    
    // Check for suspicious round numbers
    if (goalAmount >= 100000 && goalAmount % 100000 === 0) {
      score += 15; // Very round large numbers
    } else if (goalAmount >= 10000 && goalAmount % 10000 === 0) {
      score += 10; // Round numbers
    } else if (goalAmount >= 1000 && goalAmount % 1000 === 0) {
      score += 5; // Somewhat round
    }
    
    // Check against typical amounts for category
    const typicalRange = limits.typical;
    if (goalAmount > typicalRange * 5) {
      score += 20; // Much higher than typical
    } else if (goalAmount < typicalRange / 10) {
      score += 10; // Much lower than typical
    }
    
    // Suspicious specific amounts (common scam amounts)
    const suspiciousAmounts = [9999, 99999, 1111, 2222, 3333, 4444, 5555];
    if (suspiciousAmounts.includes(goalAmount)) {
      score += 20;
    }
    
    return Math.min(score, 100);
  }

  // Enhanced creator history analysis
  static async analyzeCreatorHistory(creatorId) {
    try {
      let score = 0;
      
      const previousCampaigns = await Campaign.find({ 
        creator: creatorId,
        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Last year
      }).sort({ createdAt: -1 });
      
      if (previousCampaigns.length === 0) {
        score += 15; // New creator - moderate risk
      } else {
        // Rejection rate analysis
        const rejectedCampaigns = previousCampaigns.filter(c => c.status === 'rejected').length;
        const rejectionRate = rejectedCampaigns / previousCampaigns.length;
        
        if (rejectionRate > 0.7) {
          score += 50; // Very high rejection rate
        } else if (rejectionRate > 0.5) {
          score += 35;
        } else if (rejectionRate > 0.3) {
          score += 20;
        }
        
        // Campaign frequency analysis
        const last30Days = previousCampaigns.filter(c => {
          const daysDiff = (new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24);
          return daysDiff < 30;
        });
        
        const last7Days = previousCampaigns.filter(c => {
          const daysDiff = (new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24);
          return daysDiff < 7;
        });
        
        if (last7Days.length > 2) {
          score += 30; // Too many campaigns in a week
        } else if (last30Days.length > 5) {
          score += 25; // Too many campaigns in a month
        } else if (last30Days.length > 3) {
          score += 15;
        }
        
        // Success rate analysis
        const completedCampaigns = previousCampaigns.filter(c => c.status === 'completed').length;
        const activeCampaigns = previousCampaigns.filter(c => c.status === 'active').length;
        const totalFundable = completedCampaigns + activeCampaigns;
        
        if (totalFundable > 0) {
          const completionRate = completedCampaigns / totalFundable;
          if (completionRate < 0.2 && totalFundable > 3) {
            score += 20; // Very low completion rate
          } else if (completionRate < 0.4 && totalFundable > 2) {
            score += 10;
          }
        }
        
        // Check for suspicious patterns in amounts
        if (previousCampaigns.length > 2) {
          const amounts = previousCampaigns.map(c => c.goalAmount);
          const sameAmounts = amounts.filter(amount => amounts.filter(a => a === amount).length > 1);
          if (sameAmounts.length > 1) {
            score += 15; // Repeated amounts across campaigns
          }
        }
      }
      
      return Math.min(score, 100);
    } catch (error) {
      console.error('Creator history analysis error:', error);
      return 20; // Higher default risk for errors
    }
  }

  // Enhanced pattern analysis
  static async analyzePatterns(campaign) {
    try {
      let score = 0;
      
      const recentCampaigns = await Campaign.find({
        category: campaign.category,
        creator: { $ne: campaign.creator },
        createdAt: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } // Last 60 days
      });
      
      // Enhanced title similarity check
      const titleWords = campaign.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      
      for (const similarCampaign of recentCampaigns) {
        const similarWords = similarCampaign.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const commonWords = titleWords.filter(word => similarWords.includes(word));
        
        const similarityRatio = commonWords.length / Math.min(titleWords.length, similarWords.length);
        
        if (similarityRatio > 0.7) {
          score += 25; // Very similar title
          break; // Don't double-penalize
        } else if (similarityRatio > 0.5) {
          score += 15;
        }
      }
      
      // Enhanced description similarity
      const descWords = campaign.description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      
      for (const similarCampaign of recentCampaigns) {
        const similarDescWords = similarCampaign.description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const commonDescWords = descWords.filter(word => similarDescWords.includes(word));
        
        const descSimilarityRatio = commonDescWords.length / Math.min(descWords.length, similarDescWords.length);
        
        if (descSimilarityRatio > 0.6) {
          score += 30; // Very similar description
          break;
        } else if (descSimilarityRatio > 0.4) {
          score += 20;
        }
      }
      
      // Check for amount clustering (multiple campaigns with very similar amounts)
      const similarAmountCampaigns = recentCampaigns.filter(c => 
        Math.abs(c.goalAmount - campaign.goalAmount) / campaign.goalAmount < 0.1
      );
      
      if (similarAmountCampaigns.length > 3) {
        score += 15; // Too many campaigns with similar amounts
      }
      
      return Math.min(score, 100);
    } catch (error) {
      console.error('Pattern analysis error:', error);
      return 5;
    }
  }

  // Get detailed fraud indicators with enhanced descriptions
  static async getFraudIndicators(campaign) {
    const indicators = [];
    
    const titleScore = await this.analyzeTitleFraud(campaign.title);
    if (titleScore > 15) {
      indicators.push({
        type: 'Title Analysis',
        severity: titleScore > 40 ? 'High' : titleScore > 25 ? 'Medium' : 'Low',
        score: titleScore,
        description: this.getTitleIssueDescription(titleScore, campaign.title)
      });
    }
    
    const descScore = this.analyzeDescriptionFraud(campaign.description);
    if (descScore > 15) {
      indicators.push({
        type: 'Description Analysis',
        severity: descScore > 35 ? 'High' : descScore > 25 ? 'Medium' : 'Low',
        score: descScore,
        description: this.getDescriptionIssueDescription(descScore, campaign.description)
      });
    }
    
    const storyScore = await this.analyzeStoryFraud(campaign.story);
    if (storyScore > 15) {
      indicators.push({
        type: 'Story Analysis',
        severity: storyScore > 35 ? 'High' : storyScore > 25 ? 'Medium' : 'Low',
        score: storyScore,
        description: this.getStoryIssueDescription(storyScore, campaign.story)
      });
    }
    
    const amountScore = this.analyzeAmountFraud(campaign.goalAmount, campaign.category);
    if (amountScore > 10) {
      indicators.push({
        type: 'Goal Amount',
        severity: amountScore > 30 ? 'High' : amountScore > 20 ? 'Medium' : 'Low',
        score: amountScore,
        description: this.getAmountIssueDescription(amountScore, campaign.goalAmount, campaign.category)
      });
    }
    
    const creatorScore = await this.analyzeCreatorHistory(campaign.creator);
    if (creatorScore > 20) {
      indicators.push({
        type: 'Creator History',
        severity: creatorScore > 40 ? 'High' : creatorScore > 30 ? 'Medium' : 'Low',
        score: creatorScore,
        description: 'Creator shows concerning campaign history or behavioral patterns'
      });
    }
    
    const patternScore = await this.analyzePatterns(campaign);
    if (patternScore > 10) {
      indicators.push({
        type: 'Pattern Analysis',
        severity: patternScore > 25 ? 'High' : patternScore > 15 ? 'Medium' : 'Low',
        score: patternScore,
        description: 'Campaign shows similarity to other potentially fraudulent campaigns'
      });
    }
    
    return indicators;
  }

  // Helper methods for detailed issue descriptions
  static getTitleIssueDescription(score, title) {
    const issues = [];
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('urgent') || titleLower.includes('emergency')) {
      issues.push('Contains urgency-based emotional appeals');
    }
    if ((title.match(/[A-Z]/g) || []).length / title.length > 0.3) {
      issues.push('Excessive use of capital letters');
    }
    if ((title.match(/[!?]{2,}/g) || []).length > 0) {
      issues.push('Excessive punctuation usage');
    }
    if (title.length < 10) {
      issues.push('Title too short and vague');
    }
    
    return issues.length > 0 ? issues.join('; ') : 'Multiple suspicious elements detected in title';
  }

  static getDescriptionIssueDescription(score, description) {
    const issues = [];
    const descLower = description.toLowerCase();
    
    if (descLower.includes('send money') || descLower.includes('paypal')) {
      issues.push('Contains direct financial solicitation');
    }
    if (description.length < 100) {
      issues.push('Description too brief and lacks detail');
    }
    if (descLower.includes('trust me') || descLower.includes('guaranteed')) {
      issues.push('Uses trust-based or guarantee language');
    }
    
    return issues.length > 0 ? issues.join('; ') : 'Multiple concerning elements in description';
  }

  static getStoryIssueDescription(score, story) {
    const issues = [];
    
    if (story.length < 200) {
      issues.push('Story too short for credible narrative');
    }
    if (story.toLowerCase().includes('copy and paste')) {
      issues.push('Shows signs of copied content');
    }
    
    const sentences = story.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const shortSentences = sentences.filter(s => s.trim().length < 15).length;
    if (shortSentences / sentences.length > 0.7) {
      issues.push('Inconsistent sentence structure');
    }
    
    return issues.length > 0 ? issues.join('; ') : 'Story shows potential fabrication indicators';
  }

  static getAmountIssueDescription(score, amount, category) {
    if (score > 30) {
      return `Amount ${amount} is significantly outside normal range for ${category} campaigns`;
    } else if (score > 20) {
      return `Amount ${amount} is higher than typical for ${category} category`;
    } else {
      return `Amount ${amount} shows some inconsistency with ${category} campaigns`;
    }
  }

  // Get detailed risk factors for manual review
  static async getDetailedRiskFactors(campaign) {
    const factors = [];
    
    // Add specific risk factors based on analysis
    const titleScore = await this.analyzeTitleFraud(campaign.title);
    const descScore = this.analyzeDescriptionFraud(campaign.description);
    const storyScore = await this.analyzeStoryFraud(campaign.story);
    const amountScore = this.analyzeAmountFraud(campaign.goalAmount, campaign.category);
    const creatorScore = await this.analyzeCreatorHistory(campaign.creator);
    
    if (titleScore > 25) factors.push('High-risk language in title');
    if (descScore > 25) factors.push('Suspicious description content');
    if (storyScore > 25) factors.push('Story authenticity concerns');
    if (amountScore > 20) factors.push('Unrealistic funding goal');
    if (creatorScore > 30) factors.push('Concerning creator history');
    
    return factors;
  }

  // Optimized risk level determination with lower thresholds
  static getRiskLevel(score) {
    if (score >= 50) return 'Critical';
    if (score >= 35) return 'Very High';
    if (score >= 25) return 'High';
    if (score >= 18) return 'Medium';
    if (score >= 12) return 'Low';
    return 'Very Low';
  }

  // Optimized recommendation system with better distribution
  static getRecommendation(score) {
    if (score >= 50) {
      return 'REJECT IMMEDIATELY - Critical fraud indicators detected';
    } else if (score >= 35) {
      return 'REJECT - Very high fraud probability detected';
    } else if (score >= 25) {
      return 'MANUAL REVIEW REQUIRED - High risk factors present';
    } else if (score >= 18) {
      return 'DETAILED REVIEW RECOMMENDED - Medium risk detected';
    } else if (score >= 12) {
      return 'STANDARD REVIEW - Some concerns identified';
    } else if (score >= 8) {
      return 'QUICK REVIEW - Minor flags detected';
    } else {
      return 'APPROVE - Very low fraud risk';
    }
  }

  // Get confidence level for the analysis (optimized)
  static getConfidenceLevel(score, indicatorCount) {
    if (indicatorCount >= 3 && (score >= 30 || score <= 15)) {
      return 'High';
    } else if (indicatorCount >= 2 && (score >= 20 || score <= 20)) {
      return 'Medium';
    } else if (indicatorCount >= 1) {
      return 'Medium';
    } else {
      return 'Low';
    }
  }
}

module.exports = FraudDetectionService;