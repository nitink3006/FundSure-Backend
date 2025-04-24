// middleware/fileUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create temporary uploads directory if it doesn't exist
const tempDir = path.join(__dirname, '../temp-uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer storage for temporary files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'video/mp4',
    'video/mpeg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type!'), false);
  }
};

// Multer middleware for handling file uploads
exports.uploadMultiple = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
  },
  fileFilter,
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
  { name: 'verificationDocument', maxCount: 3 },
]);

// Helper function to determine resource type and folder based on mime type
const getUploadOptions = (mimetype) => {
  if (mimetype.startsWith('image/')) {
    return { 
      resource_type: 'image',
      folder: 'images',
      upload_preset: process.env.CLOUDINARY_IMAGE_PRESET
    };
  }
  
  if (mimetype.startsWith('video/')) {
    return { 
      resource_type: 'video',
      folder: 'videos',
      upload_preset: process.env.CLOUDINARY_VIDEO_PRESET
    };
  }
  
  return { 
    resource_type: 'raw',
    folder: 'documents',
    upload_preset: process.env.CLOUDINARY_DOCUMENT_PRESET
  };
};

// Function to upload a single file to Cloudinary
const uploadToCloudinary = async (file) => {
  const { resource_type, folder, upload_preset } = getUploadOptions(file.mimetype);
  
  try {
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type,
      folder,
      upload_preset,
      use_filename: true,
      unique_filename: true
    });
    
    // Delete the temporary file
    fs.unlinkSync(file.path);
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: resource_type
    };
  } catch (error) {
    // Clean up the temp file if upload fails
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw error;
  }
};

// Process uploads and send to Cloudinary
exports.processUploads = async (req, res, next) => {
  try {
    const filesObj = req.files;
    const result = {};
    
    // Process images
    if (filesObj.images && filesObj.images.length > 0) {
      result.images = await Promise.all(
        filesObj.images.map(file => uploadToCloudinary(file))
      );
    }
    
    // Process videos
    if (filesObj.videos && filesObj.videos.length > 0) {
      result.videos = await Promise.all(
        filesObj.videos.map(file => uploadToCloudinary(file))
      );
    }
    
    // Process verification documents
    if (filesObj.verificationDocument && filesObj.verificationDocument.length > 0) {
      result.verificationDocument = await Promise.all(
        filesObj.verificationDocument.map(file => uploadToCloudinary(file))
      );
    }
    
    // Add the Cloudinary results to the request object
    req.cloudinaryResults = result;
    next();
  } catch (error) {
    next(error);
  }
};

// Delete a file from Cloudinary
exports.deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};