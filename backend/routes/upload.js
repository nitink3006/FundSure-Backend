// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { uploadMultiple, processUploads } = require('../middleware/fileUpload');

// POST /api/uploads - Complete server-side handling
router.post('/', uploadMultiple, processUploads, (req, res) => {
  try {
    // The cloudinaryResults contains all uploaded file information
    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully to Cloudinary',
      files: req.cloudinaryResults,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'File upload failed',
    });
  }
});

module.exports = router;