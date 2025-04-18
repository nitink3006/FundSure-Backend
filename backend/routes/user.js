const express = require('express');
const router = express.Router();
const { getUserDashboard } = require('../controller/userController');
const authMiddleware = require('../middleware/auth');

router.get('/dashboard', authMiddleware, getUserDashboard);

module.exports = router;
