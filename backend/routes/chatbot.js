require('dotenv').config();
const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const User = require("../models/User");
const { protect } = require("../middleware/auth"); 

const genAI = new GoogleGenerativeAI(process.env.Gemini_API_KEY);

// Function to get top donation category based on user history
const getTopDonationCategory = (userDonations) => {
  const categoryCount = {};
  userDonations.forEach(don => {
    const category = don.campaign?.category || "General";
    categoryCount[category] = (categoryCount[category] || 0) + 1;
  });
  const topCategory = Object.keys(categoryCount).sort((a, b) => categoryCount[b] - categoryCount[a])[0];
  return topCategory || null;
};

router.post("/chatbot", protect, async (req, res) => {
    try {
      const { message } = req.body;
      const userId = req.user ? req.user.id : null;
      console.log("User ID:", userId); 
  
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
  
      // Fetch all campaigns
      const campaigns = await Campaign.find({}).populate("creator", "name").lean();
  
      // Get donations for the logged-in user
      const donations = await Donation.find({ donor: userId })
        .populate('campaign', 'title category description goalAmount raisedAmount') // Populate campaign details
        .populate('donor', 'name') // Populate donor details
        .lean();
  
      let userInfo = null;
      if (userId) {
        userInfo = await User.findById(userId).lean();
      }
  
      // Create summaries of campaigns and donations
      const campaignSummaries = campaigns.map(camp => (
          `Campaign: ${camp.title}\nCategory: ${camp.category}\nDescription: ${camp.description}\nGoal: ₹${camp.goalAmount}\nRaised: ₹${camp.raisedAmount}`
        )).join("\n\n");
  
      const donationSummaries = donations.map(don => (
          `Donor: ${don.donor?.name || "Anonymous"} donated ₹${don.amount} to "${don.campaign?.title || "Unknown Campaign"}"`
        )).join("\n");
  
      // Smart Greeting: Change based on user or guest
      let greeting = "Hello! How can I assist you today?";
      if (userInfo) {
        greeting = `Good day, ${userInfo.name}! How can I help you today?`;
      }
  
      // Recommendation Context: Custom recommendations based on user donations
      let recommendationContext = "Suggest trending campaigns.";
      if (userInfo && donations.length > 0) {
        const topCategory = getTopDonationCategory(donations);
        if (topCategory) {
          recommendationContext = `Suggest campaigns in the '${topCategory}' category based on user interests.`;
        }
      }
  
      // Create the prompt for chatbot based on user context and database info
      const prompt = `
        You are an assistant on a crowdfunding platform.
  
        Greeting: ${greeting}
  
        User Information:
        ${userInfo ? `Name: ${userInfo.name}, Donations: ${donations.length}` : "Guest user."}
  
        Platform Data:
        Campaigns:
        ${campaignSummaries}
  
        Recent Donations:
        ${donationSummaries}
  
        Recommendation Guide:
        ${recommendationContext}
  
        Answer the following question based on the user's query:
        "${message}"
  
        Provide the relevant information for the user's query based on the above context:
        - For "login", provide login steps.
        - For "donate", explain donation process.
        - For "funding", explain how to contribute.
        - For "campaigns", recommend relevant campaigns.
        - Only respond with answers that are specific to our platform's data (no general knowledge).
      `;
  
      // Make the request to Gemini model for content generation
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = await response.text();
  
      // Send the generated response back to the user
      return res.json({ response: text });
  
    } catch (error) {
      console.error("Full error:", error.stack);
      return res.status(500).json({ error: "Internal server error", details: error.message });
    }
  });
  

module.exports = router;
