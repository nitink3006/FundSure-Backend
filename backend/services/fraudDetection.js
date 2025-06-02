const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

class FraudDetectionService {
  
  // Main fraud detection function
  static async analyzeCampaign(campaignData) {
    try {
      // First process images for fraud detection
      const imageAnalysis = await this.analyzeImages(campaignData);
      
      // Then calculate traditional fraud metrics
      const fraudScore = await this.calculateFraudScore(campaignData, imageAnalysis);
      const fraudIndicators = await this.getFraudIndicators(campaignData, imageAnalysis);
      const riskFactors = await this.getDetailedRiskFactors(campaignData, imageAnalysis);
      
      return {
        fraudScore: Math.round(fraudScore),
        riskLevel: this.getRiskLevel(fraudScore),
        indicators: fraudIndicators,
        riskFactors: riskFactors,
        recommendation: this.getRecommendation(fraudScore),
        needsManualReview: fraudScore >= 25,
        autoApprove: fraudScore < 12,
        confidence: this.getConfidenceLevel(fraudScore, fraudIndicators.length),
        imageAnalysis: imageAnalysis
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
        confidence: 'Low',
        imageAnalysis: null
      };
    }
  }

  // Enhanced fraud score calculation with image analysis
  static async calculateFraudScore(campaign, imageAnalysis) {
    let totalScore = 0;
    
    const weights = {
      title: 0.20,        // 20% - Title analysis
      description: 0.15,  // 15% - Description analysis  
      story: 0.15,        // 15% - Story analysis
      amount: 0.12,       // 12% - Amount analysis
      creator: 0.10,      // 10% - Creator history
      patterns: 0.08,     // 8% - Pattern analysis
      images: 0.20        // 20% - Image analysis (new)
    };
    
    // Calculate individual scores
    const titleScore = await this.analyzeTitleFraud(campaign.title);
    const descScore = this.analyzeDescriptionFraud(campaign.description);
    const storyScore = await this.analyzeStoryFraud(campaign.story);
    const amountScore = this.analyzeAmountFraud(campaign.goalAmount, campaign.category);
    const creatorScore = await this.analyzeCreatorHistory(campaign.creator);
    const patternScore = await this.analyzePatterns(campaign);
    const imageScore = imageAnalysis ? imageAnalysis.overallRiskScore : 0;
    
    // Apply weights and calculate final score
    totalScore += titleScore * weights.title;
    totalScore += descScore * weights.description;
    totalScore += storyScore * weights.story;
    totalScore += amountScore * weights.amount;
    totalScore += creatorScore * weights.creator;
    totalScore += patternScore * weights.patterns;
    totalScore += imageScore * weights.images;
    
    // Apply base risk factor
    const baseRisk = 5;
    totalScore += baseRisk;
    
    // Apply amplification for multiple risk factors
    const riskFactors = [titleScore, descScore, storyScore, amountScore, creatorScore, patternScore, imageScore];
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
    
    if (imageScore > 40) {
      totalScore = Math.max(totalScore, 45);
    }
    
    return Math.min(totalScore, 100);
  }

  // Image analysis for fraud detection
  static async analyzeImages(campaign) {
    try {
      const analysis = {
        coverImage: null,
        additionalImages: [],
        videos: [],
        overallRiskScore: 0,
        imageIndicators: []
      };
      
      // Analyze cover image
      if (campaign.imageUrl) {
        analysis.coverImage = await this.analyzeSingleImage(campaign.imageUrl);
        analysis.overallRiskScore += analysis.coverImage.riskScore * 0.6; // Cover image has higher weight
        analysis.imageIndicators.push(...analysis.coverImage.indicators);
      }
      
      // Analyze additional images
      if (campaign.additionalImages && campaign.additionalImages.length > 0) {
        for (const imgUrl of campaign.additionalImages) {
          const imgAnalysis = await this.analyzeSingleImage(imgUrl);
          analysis.additionalImages.push(imgAnalysis);
          analysis.overallRiskScore += imgAnalysis.riskScore * 0.3 / campaign.additionalImages.length;
          analysis.imageIndicators.push(...imgAnalysis.indicators);
        }
      }
      
      // Analyze videos (basic analysis for now)
      if (campaign.videos && campaign.videos.length > 0) {
        analysis.videos = campaign.videos.map(video => ({
          url: video,
          analysis: 'Video analysis not yet implemented'
        }));
      }
      
      // Calculate normalized overall score (0-100)
      analysis.overallRiskScore = Math.min(analysis.overallRiskScore, 100);
      
      return analysis;
    } catch (error) {
      console.error('Image analysis error:', error);
      return {
        coverImage: null,
        additionalImages: [],
        videos: [],
        overallRiskScore: 20, // Default risk if analysis fails
        imageIndicators: ['Image analysis failed'],
        error: error.message
      };
    }
  }

  // Analyze a single image for fraud indicators
  static async analyzeSingleImage(imageUrl) {
    try {
      const tempPath = path.join(__dirname, 'temp', `img-${Date.now()}.jpg`);
      
      // Download image to temp location
      await this.downloadImage(imageUrl, tempPath);
      
      // Basic image validation
      const metadata = await sharp(tempPath).metadata();
      
      const analysis = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        riskScore: 0,
        indicators: [],
        isEdited: false,
        isStockPhoto: false,
        isScreenshot: false,
        qualityIssues: false
      };
      
      // Check image dimensions
      if (metadata.width < 400 || metadata.height < 400) {
        analysis.riskScore += 15;
        analysis.indicators.push('Image dimensions too small (possible low quality)');
        analysis.qualityIssues = true;
      }
      
      // Check for common stock photo characteristics
      const isStock = await this.checkStockPhoto(tempPath);
      if (isStock) {
        analysis.riskScore += 25;
        analysis.indicators.push('Image appears to be a stock photo');
        analysis.isStockPhoto = true;
      }
      
      // Check for screenshot indicators
      const isScreenshot = await this.checkScreenshot(tempPath);
      if (isScreenshot) {
        analysis.riskScore += 20;
        analysis.indicators.push('Image appears to be a screenshot');
        analysis.isScreenshot = true;
      }
      
      // Check for editing artifacts
      const isEdited = await this.checkImageEditing(tempPath);
      if (isEdited) {
        analysis.riskScore += 30;
        analysis.indicators.push('Signs of image editing detected');
        analysis.isEdited = true;
      }
      
      // Check image quality
      const qualityScore = await this.assessImageQuality(tempPath);
      if (qualityScore < 50) {
        analysis.riskScore += 10;
        analysis.indicators.push('Low image quality detected');
        analysis.qualityIssues = true;
      }
      
      // Clean up temp file
      fs.unlinkSync(tempPath);
      
      return analysis;
    } catch (error) {
      console.error('Single image analysis error:', error);
      return {
        error: error.message,
        riskScore: 20,
        indicators: ['Image analysis failed']
      };
    }
  }

  // Helper to download image for analysis
  static async downloadImage(url, destPath) {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const response = await fetch(url);
    const buffer = await response.buffer();
    fs.writeFileSync(destPath, buffer);
  }

  // Check if image appears to be a stock photo
  static async checkStockPhoto(imagePath) {
    // This would use a more sophisticated approach in production
    const metadata = await sharp(imagePath).metadata();
    
    // Stock photos often have certain EXIF data
    if (metadata.exif) {
      const exif = metadata.exif.toString('utf8');
      if (exif.includes('StockPhoto') || exif.includes('Getty') || exif.includes('Shutterstock')) {
        return true;
      }
    }
    
    // Check for common stock photo dimensions
    const commonStockSizes = [
      {w: 800, h: 600}, {w: 1024, h: 768}, {w: 1920, h: 1080}
    ];
    
    const isCommonSize = commonStockSizes.some(size => 
      metadata.width === size.w && metadata.height === size.h
    );
    
    return isCommonSize;
  }

  // Check if image is a screenshot
  static async checkScreenshot(imagePath) {
    const metadata = await sharp(imagePath).metadata();
    
    // Screenshots often have specific characteristics
    if (metadata.density && metadata.density > 200) {
      return true;
    }
    
    // Check for common screenshot patterns
    const { data, info } = await sharp(imagePath)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Simple check for uniform borders (common in screenshots)
    const pixelAt = (x, y) => {
      const offset = (y * info.width + x) * info.channels;
      return {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2]
      };
    };
    
    // Check top border
    const topColor = pixelAt(0, 0);
    let uniformTop = true;
    for (let x = 1; x < Math.min(10, info.width); x++) {
      const curr = pixelAt(x, 0);
      if (Math.abs(curr.r - topColor.r) > 10 || 
          Math.abs(curr.g - topColor.g) > 10 || 
          Math.abs(curr.b - topColor.b) > 10) {
        uniformTop = false;
        break;
      }
    }
    
    return uniformTop;
  }

  // Check for signs of image editing
  static async checkImageEditing(imagePath) {
    // This would use more sophisticated algorithms in production
    const metadata = await sharp(imagePath).metadata();
    
    // Check for Photoshop metadata
    if (metadata.exif) {
      const exif = metadata.exif.toString('utf8');
      if (exif.includes('Photoshop') || exif.includes('Adobe')) {
        return true;
      }
    }
    
    // Check for ELA (Error Level Analysis) - basic implementation
    const elaScore = await this.performELAAnalysis(imagePath);
    if (elaScore > 25) {
      return true;
    }
    
    return false;
  }

  // Basic ELA (Error Level Analysis) implementation
  static async performELAAnalysis(imagePath) {
    // Save a compressed version
    const compressedPath = imagePath + '.compressed.jpg';
    await sharp(imagePath)
      .jpeg({ quality: 90 })
      .toFile(compressedPath);
    
    // Calculate differences
    const orig = await sharp(imagePath).raw().toBuffer();
    const comp = await sharp(compressedPath).raw().toBuffer();
    
    let totalDiff = 0;
    for (let i = 0; i < orig.length; i++) {
      totalDiff += Math.abs(orig[i] - comp[i]);
    }
    
    // Clean up
    fs.unlinkSync(compressedPath);
    
    // Normalize score (0-100)
    const avgDiff = totalDiff / orig.length;
    return Math.min(avgDiff * 2, 100);
  }

  // Assess basic image quality metrics
  static async assessImageQuality(imagePath) {
    const metadata = await sharp(imagePath).metadata();
    
    let score = 100;
    
    // Penalize small images
    if (metadata.width < 800 || metadata.height < 600) {
      score -= 30;
    }
    
    // Penalize low quality JPEGs
    if (metadata.format === 'jpeg' && metadata.size < 50000) {
      score -= 20;
    }
    
    // Check for blurriness (basic implementation)
    const blurScore = await this.assessBlur(imagePath);
    score -= blurScore;
    
    return Math.max(0, score);
  }

  // Basic blur assessment
  static async assessBlur(imagePath) {
    try {
      const { data, info } = await sharp(imagePath)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      let edgeIntensity = 0;
      const kernel = [-1, 0, 1];
      
      for (let y = 1; y < info.height - 1; y++) {
        for (let x = 1; x < info.width - 1; x++) {
          const idx = (y * info.width + x) * info.channels;
          
          // Simple edge detection
          let gx = 0, gy = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const kidx = ((y + ky) * info.width + (x + kx)) * info.channels;
              const val = data[kidx]; // Using red channel for simplicity
              
              gx += kernel[kx + 1] * val;
              gy += kernel[ky + 1] * val;
            }
          }
          
          edgeIntensity += Math.sqrt(gx * gx + gy * gy);
        }
      }
      
      // Normalize and convert to blur score (higher = more blur)
      const avgEdge = edgeIntensity / (info.width * info.height);
      return Math.min(100 - (avgEdge / 2), 50); // Max 50 points deduction
    } catch (error) {
      console.error('Blur assessment error:', error);
      return 20; // Default blur penalty if analysis fails
    }
  }

  // [Previous fraud detection methods remain unchanged...]
  static async analyzeTitleFraud(title) {
    // ... (keep existing implementation)
  }

  static analyzeDescriptionFraud(description) {
    // ... (keep existing implementation)
  }

  static async analyzeStoryFraud(story) {
    // ... (keep existing implementation)
  }

  static analyzeAmountFraud(goalAmount, category) {
    // ... (keep existing implementation)
  }

  static async analyzeCreatorHistory(creatorId) {
    // ... (keep existing implementation)
  }

  static async analyzePatterns(campaign) {
    // ... (keep existing implementation)
  }

  // Enhanced fraud indicators with image analysis
  static async getFraudIndicators(campaign, imageAnalysis) {
    const indicators = [];
    
    // Traditional text-based indicators
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
    
    // Add image-based indicators
    if (imageAnalysis && imageAnalysis.overallRiskScore > 15) {
      indicators.push({
        type: 'Image Analysis',
        severity: imageAnalysis.overallRiskScore > 40 ? 'High' : 
                imageAnalysis.overallRiskScore > 25 ? 'Medium' : 'Low',
        score: imageAnalysis.overallRiskScore,
        description: this.getImageIssueDescription(imageAnalysis)
      });
      
      // Add specific image indicators if available
      if (imageAnalysis.imageIndicators && imageAnalysis.imageIndicators.length > 0) {
        imageAnalysis.imageIndicators.forEach(ind => {
          indicators.push({
            type: 'Image Indicator',
            severity: 'Medium',
            score: 20,
            description: ind
          });
        });
      }
    }
    
    return indicators;
  }

  static getImageIssueDescription(imageAnalysis) {
    const issues = [];
    
    if (imageAnalysis.coverImage && imageAnalysis.coverImage.isStockPhoto) {
      issues.push('Cover image appears to be a stock photo');
    }
    
    if (imageAnalysis.coverImage && imageAnalysis.coverImage.isEdited) {
      issues.push('Signs of image editing detected');
    }
    
    if (imageAnalysis.coverImage && imageAnalysis.coverImage.qualityIssues) {
      issues.push('Image quality concerns');
    }
    
    return issues.length > 0 ? issues.join('; ') : 'Multiple image anomalies detected';
  }

  // Get detailed risk factors including image analysis
  static async getDetailedRiskFactors(campaign, imageAnalysis) {
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
    
    // Add image risk factors
    if (imageAnalysis) {
      if (imageAnalysis.overallRiskScore > 30) {
        factors.push('Suspicious image characteristics');
      }
      
      if (imageAnalysis.coverImage && imageAnalysis.coverImage.isStockPhoto) {
        factors.push('Stock photo used as campaign image');
      }
      
      if (imageAnalysis.coverImage && imageAnalysis.coverImage.isEdited) {
        factors.push('Evidence of image editing');
      }
    }
    
    return factors;
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