const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth"); 

const genAI = new GoogleGenerativeAI(process.env.Gemini_API_KEY);

// Utility function to find top category
const getTopDonationCategory = (userDonations) => {
  const categoryCount = {};

  userDonations.forEach(don => {
    const category = don.campaign?.category || "General";
    categoryCount[category] = (categoryCount[category] || 0) + 1;
  });

  const topCategory = Object.keys(categoryCount).sort((a, b) => categoryCount[b] - categoryCount[a])[0];
  return topCategory || null;
};

router.post("/chatbot", async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId || null;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const campaigns = await Campaign.find({})
      .populate("created_by", "name")
      .lean();

    const donations = await Donation.find({})
      .populate("donor", "name")
      .populate("campaign", "title category")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    let userInfo = null;
    if (userId) {
      userInfo = await User.findById(userId)
        .populate({
          path: "donations",
          populate: { path: "campaign", select: "title category" }
        })
        .lean();
    }

    const campaignSummaries = campaigns.map(camp => (
      `Campaign: ${camp.title}\nCategory: ${camp.category}\nDescription: ${camp.description}\nGoal: ${camp.funding_goal}\nRaised: ${camp.amount_raised}\nCreated by: ${camp.created_by?.name || "Unknown"}\n`
    )).join("\n\n");

    const donationSummaries = donations.map(don => (
      `Donor: ${don.donor?.name || "Anonymous"} donated ${don.amount} to ${don.campaign?.title || "Unknown Campaign"}`
    )).join("\n");

    // Smart Greeting
    let greeting = "Hello! How can I assist you today?";
    if (userInfo) {
      greeting = `Welcome back, ${userInfo.name}! Hope you're having a great day.`;
    }

    // Smart Recommendation
    let recommendationContext = "Suggest top trending campaigns.";
    if (userInfo && userInfo.donations.length > 0) {
      const topCategory = getTopDonationCategory(userInfo.donations);
      if (topCategory) {
        recommendationContext = `Suggest campaigns especially from the '${topCategory}' category as the user is interested in it.`;
      }
    }

    const prompt = `
      You are an intelligent chatbot assistant for a crowdfunding platform.

      Greet the user:
      ${greeting}

      User context:
      ${userInfo ? `
        Name: ${userInfo.name}
        Total Donations: ${userInfo.donations.length}
      ` : "Guest user."}

      Platform campaigns:
      ${campaignSummaries}

      Recent donations:
      ${donationSummaries}

      Recommendation guide:
      ${recommendationContext}

      Now, based on the above, do the following:
      - Answer the user's question: "${message}"
      - Suggest 2-3 relevant campaigns matching user interests
      - Be very friendly, helpful and keep the language simple and positive
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();

    return res.json({ response: text });

  } catch (error) {
    console.error("Error in chatbot route:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
