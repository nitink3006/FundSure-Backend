const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../Cloudinary'); // adjust path as needed

// Define allowed types
const allowedFormats = [
  'jpg', 'jpeg', 'png', 'webp', 'mp4', 'mpeg', 'pdf', 'doc', 'docx'
];

// Use cloud storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folder = 'uploads'; // Your cloudinary folder
    const ext = file.mimetype.split('/')[1];
    
    return {
      folder,
      allowed_formats: allowedFormats,
      public_id: file.fieldname + '-' + Date.now(),
      resource_type: ext === 'mp4' || ext === 'mpeg' ? 'video' : 'auto'
    };
  },
});

const upload = multer({ storage });

// This supports multiple fields
exports.uploadMultiple = upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
  { name: 'verificationDocument', maxCount: 3 },
]);

// Get URLs from cloudinary files
exports.getFilePaths = (filesObj) => {
  const result = {};

  if (filesObj.images) {
    result.images = filesObj.images.map(file => file.path); // Cloudinary URL
  }

  if (filesObj.videos) {
    result.videos = filesObj.videos.map(file => file.path);
  }

  if (filesObj.verificationDocument) {
    result.verificationDocument = filesObj.verificationDocument.map(file => file.path);
  }

  return result;
};
