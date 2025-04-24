
const express = require('express');
const Campaign = require('../models/Campaign');
const { protect } = require('../middleware/auth');
const { uploadMultiple, getFilePaths } = require('../middleware/fileUpload');
const { uploadToCloudinary } = require('../middleware/fileUpload'); 

const router = express.Router();

// Get all active campaigns
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const category = req.query.category || null;
    const search = req.query.search || null;

    // Build query
    let query = { status: 'active' };
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Execute query with pagination
    const campaigns = await Campaign.find(query)
      .populate('creator', 'name email')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    // Get total count for pagination
    const total = await Campaign.countDocuments(query);

    res.status(200).json({
      success: true,
      count: campaigns.length,
      total,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
      },
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
});

// Get single campaign
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('creator', 'name email')
      .populate('comments.user', 'name');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

// Create a campaign
router.post('/', protect, (req, res, next) => {
  // Use the multer middleware to handle file uploads
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false, 
        message: err.message || 'File upload failed'
      });
    }
    
    try {
      const { title, description, story, category, goalAmount, duration } = req.body;
      
      // Process the files through Cloudinary
      const filesObj = req.files;
      const cloudinaryFiles = {};
      
      // Upload images to Cloudinary
      if (filesObj.images && filesObj.images.length > 0) {
        cloudinaryFiles.images = await Promise.all(
          filesObj.images.map(file => uploadToCloudinary(file))
        );
      }
      
      // Upload videos to Cloudinary
      if (filesObj.videos && filesObj.videos.length > 0) {
        cloudinaryFiles.videos = await Promise.all(
          filesObj.videos.map(file => uploadToCloudinary(file))
        );
      }
      
      // Upload verification documents to Cloudinary
      if (filesObj.verificationDocument && filesObj.verificationDocument.length > 0) {
        cloudinaryFiles.verificationDocument = await Promise.all(
          filesObj.verificationDocument.map(file => uploadToCloudinary(file))
        );
      }
      
      // Ensure at least one image and one verification document is uploaded
      if (!cloudinaryFiles.images || cloudinaryFiles.images.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please upload at least one campaign image',
        });
      }

      if (!cloudinaryFiles.verificationDocument || cloudinaryFiles.verificationDocument.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a verification document',
        });
      }

      // Calculate end date
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + parseInt(duration));

      // Create campaign
      const campaign = await Campaign.create({
        title,
        description,
        story,
        category,
        goalAmount,
        duration,
        imageUrl: cloudinaryFiles.images[0].url, // Use the Cloudinary URL for the cover image
        creator: req.user.id,
        endDate,
        additionalImages: cloudinaryFiles.images.slice(1).map(img => img.url), // Extract URLs for additional images
        videos: cloudinaryFiles.videos ? cloudinaryFiles.videos.map(video => video.url) : [],
        verificationDocuments: cloudinaryFiles.verificationDocument.map(doc => doc.url),
        // Optionally store public IDs for future reference (e.g., for deletion)
        cloudinaryData: {
          coverImageId: cloudinaryFiles.images[0].publicId,
          additionalImageIds: cloudinaryFiles.images.slice(1).map(img => img.publicId),
          videoIds: cloudinaryFiles.videos ? cloudinaryFiles.videos.map(video => video.publicId) : [],
          verificationDocumentIds: cloudinaryFiles.verificationDocument.map(doc => doc.publicId)
        }
      });

      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      console.error('Campaign creation error:', error);
      next(error);
    }
  });
});

// Add comment to campaign
router.post('/:id/comments', protect, async (req, res, next) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Please provide comment content',
      });
    }

    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Add comment
    campaign.comments.push({
      user: req.user.id,
      content,
    });

    await campaign.save();

    // Return the updated comments with populated user data
    const updatedCampaign = await Campaign.findById(req.params.id)
      .populate('comments.user', 'name');

    res.status(201).json({
      success: true,
      data: updatedCampaign.comments,
    });
  } catch (error) {
    next(error);
  }
});

// Get user's campaigns
router.get('/user/me', protect, async (req, res, next) => {
  try {
    const campaigns = await Campaign.find({ creator: req.user.id })
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

module.exports = router;
