
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
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File filter function
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


// Initialize multer upload
exports.uploadMultiple = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per file
  },
  fileFilter,
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
  { name: 'verificationDocument', maxCount: 3 },
]);

exports.getFilePaths = (filesObj) => {
  const result = {};

  if (filesObj.images) {
    result.images = filesObj.images.map(file => `/uploads/${file.filename}`);
  }

  if (filesObj.videos) {
    result.videos = filesObj.videos.map(file => `/uploads/${file.filename}`);
  }

 
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
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File filter function
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


// Initialize multer upload
exports.uploadMultiple = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per file
  },
  fileFilter,
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
  { name: 'verificationDocument', maxCount: 3 },
]);

exports.getFilePaths = (filesObj) => {
  const result = {};

  if (filesObj.images) {
    result.images = filesObj.images.map(file => `/uploads/${file.filename}`);
  }

  if (filesObj.videos) {
    result.videos = filesObj.videos.map(file => `/uploads/${file.filename}`);
  }

  if (filesObj.verificationDocument && filesObj.verificationDocument.length > 0) {
    result.verificationDocument = `/uploads/${filesObj.verificationDocument[0].filename}`;
  }

  return result;
};

// Process uploaded image
exports.processImage = async (file) => {
  return `/uploads/${file.filename}`;
};


  return result;
};

// Process uploaded image
exports.processImage = async (file) => {
  return `/uploads/${file.filename}`;
};
