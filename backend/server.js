const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;
const path = require('path');

// Route imports
const authRoutes = require("./routes/auth");
const campaignRoutes = require("./routes/campaigns");
const donationRoutes = require("./routes/donations");
const adminRoutes = require("./routes/admin");
const seedAdminUser = require("./utils/seedAdmin");
const userRoutes = require("./routes/user.js");
const uploadRoutes = require("./routes/upload.js");
const chatbotRoutes = require("./routes/chatbot.js");

// Load environment variables from .env
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();

// ------------------------
// ✅ CORS Configuration
// ------------------------
const allowedOrigins = ["http://localhost:8080", "https://fundsure.vercel.app"];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // if using cookies or auth headers
  })
);

// ------------------------
// Middleware
// ------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing form data

// Create temp directory for file uploads if it doesn't exist
const tempDir = path.join(__dirname, 'temp-uploads');
const fs = require('fs');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ------------------------
// MongoDB Connection
// ------------------------
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fundtogether")
  .then(() => {
    console.log("✅ Connected to MongoDB");
    // Seed admin user after DB connects
    seedAdminUser();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

// ------------------------
// Routes
// ------------------------
// Keep the original uploads route for backward compatibility
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured'
  });
});

// ------------------------
// Global Error Handler
// ------------------------
app.use((err, req, res, next) => {
  console.error("🚨 Error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Something went wrong on the server",
  });
});

// ------------------------
// Server Start
// ------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 File upload configured with ${process.env.CLOUDINARY_CLOUD_NAME ? 'Cloudinary' : 'local storage'}`);
});