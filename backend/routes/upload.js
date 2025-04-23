const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { uploadMultiple, getFilePaths } = require('../middleware/fileUpload');

// POST /api/uploads - Upload files
router.post('/', uploadMultiple, (req, res) => {
  try {
    const filePaths = getFilePaths(req.files);
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
    });
  }
});

// GET /api/uploads - Get list of uploaded files
router.get('/', (req, res) => {
  try {
    // Set file type filter from query parameters
    const fileType = req.query.type; // 'images', 'videos', 'documents', or null for all
    
    // Define paths to upload directories based on your file upload middleware
    const uploadDirs = {
      images: path.join(__dirname, '../uploads/images'),
      videos: path.join(__dirname, '../uploads/videos'),
      documents: path.join(__dirname, '../uploads/documents')
    };
    
    const result = {};
    
    // Get files based on filter or all files
    if (!fileType || fileType === 'all') {
      // Get all file types
      Object.keys(uploadDirs).forEach(type => {
        result[type] = getFilesFromDir(uploadDirs[type], type);
      });
    } else if (uploadDirs[fileType]) {
      // Get specific file type
      result[fileType] = getFilesFromDir(uploadDirs[fileType], fileType);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type specified'
      });
    }
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error retrieving files:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve files'
    });
  }
});

// GET /api/uploads/:type/:filename - Get a specific file
router.get('/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    
    // Validate file type
    const validTypes = ['images', 'videos', 'documents'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }
    
    // Create file path
    const filePath = path.join(__dirname, `../uploads/${type}/${filename}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Send file
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error retrieving file:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve file'
    });
  }
});

// Helper function to get files from a directory
function getFilesFromDir(dirPath, type) {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    
    const files = fs.readdirSync(dirPath);
    return files.map(file => {
      const stats = fs.statSync(path.join(dirPath, file));
      return {
        name: file,
        path: `/api/uploads/${type}/${file}`,
        size: stats.size,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime
      };
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

module.exports = router;
