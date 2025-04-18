const express = require('express');
const router = express.Router();
const { getUserDashboard } = require('../controller/userController');
const { protect } = require('../middleware/auth');

router.get('/dashboard', protect, getUserDashboard);

module.exports = router;
