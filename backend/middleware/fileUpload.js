const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
    'video/mp4', 'video/mpeg',
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

exports.uploadMultiple = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
  { name: 'verificationDocument', maxCount: 3 },
]);

// ✅ SAFE: Prevent undefined `.map` errors
exports.getFilePaths = (filesObj = {}) => {
  return {
    images: Array.isArray(filesObj.images)
      ? filesObj.images.map(file => `/uploads/${file.filename}`)
      : [],

    videos: Array.isArray(filesObj.videos)
      ? filesObj.videos.map(file => `/uploads/${file.filename}`)
      : [],

    verificationDocument: Array.isArray(filesObj.verificationDocument)
      ? filesObj.verificationDocument.map(file => `/uploads/${file.filename}`)
      : [],
  };
};

exports.processImage = async (file) => {
  return `/uploads/${file.filename}`;
};
