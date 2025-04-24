const express = require('express');
const router = express.Router();
const { uploadMultiple, getFilePaths } = require('../middleware/fileUpload'); // Keep this path adjusted

// POST /api/uploads
router.post('/', uploadMultiple, (req, res) => {
  try {
    const filePaths = getFilePaths(req.files); // These are Cloudinary URLs now
    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      files: filePaths,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: err.message,
    });
  }
});

module.exports = router;
