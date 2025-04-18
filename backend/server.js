const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

// Route imports
const authRoutes = require("./routes/auth");
const campaignRoutes = require("./routes/campaigns");
const donationRoutes = require("./routes/donations");
const adminRoutes = require("./routes/admin");
const seedAdminUser = require("./utils/seedAdmin");
const userRoutes = require("./routes/user.js");


// Load environment variables from .env
dotenv.config();

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
app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);


// ------------------------
// Global Error Handler
// ------------------------
app.use((err, req, res, next) => {
  console.error("🚨 Error:", err.stack);
  res.status(500).json({
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
});
