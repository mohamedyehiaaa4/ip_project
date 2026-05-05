const express = require("express");
const Comment = require("../models/Comment");
const Product = require("../models/Product");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.post("/", auth(), async (req, res) => {
  try {
    const { productId, text, rating } = req.body || {};
    if (!productId || !text || !rating) {
      return res.status(400).json({ message: "productId, text, rating are required" });
    }

    const normalizedRating = Number(rating);
    if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ message: "rating must be between 1 and 5" });
    }

    const existing = await Comment.findOne({ productId, userId: req.user.id });
    if (existing) {
      if (Number(existing.rating) === normalizedRating) {
        return res.status(409).json({ message: "You already reviewed this product with the same rating" });
      }

      existing.text = String(text).trim();
      existing.rating = normalizedRating;
      await existing.save();

      const stats = await Comment.aggregate([
        { $match: { productId: existing.productId } },
        {
          $group: {
            _id: "$productId",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 }
          }
        }
      ]);

      if (stats.length) {
        await Product.updateOne(
          { _id: existing.productId },
          {
            $set: {
              ratings: Number(stats[0].averageRating || 0),
              reviewCount: Number(stats[0].reviewCount || 0)
            }
          }
        );
      }

      return res.json(existing);
    }

    const comment = await Comment.create({
      productId,
      userId: req.user.id,
      text: String(text).trim(),
      rating: normalizedRating
    });

    const stats = await Comment.aggregate([
      { $match: { productId: comment.productId } },
      {
        $group: {
          _id: "$productId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    if (stats.length) {
      await Product.updateOne(
        { _id: comment.productId },
        {
          $set: {
            ratings: Number(stats[0].averageRating || 0),
            reviewCount: Number(stats[0].reviewCount || 0)
          }
        }
      );
    }

    return res.status(201).json(comment);
  } catch (err) {
    return res.status(500).json({ message: "Failed to add comment", error: err.message });
  }
});

router.get("/product/:productId", async (req, res) => {
  try {
    const comments = await Comment.find({ productId: req.params.productId }).sort({ createdAt: -1 });
    return res.json(comments);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch comments", error: err.message });
  }
});

function basicFallbackSummary(comments, avg) {
  const positives = comments.filter((c) => /good|great|excellent|fast|love|perfect|amazing|awesome/i.test(c.text)).length;
  const negatives = comments.filter((c) => /bad|slow|poor|broken|late|problem|terrible|worst/i.test(c.text)).length;
  const tone = positives > negatives ? "mostly positive" : positives < negatives ? "mostly negative" : "mixed";
  return `Based on ${comments.length} review(s), the average rating is ${avg.toFixed(1)}/5 with ${tone} feedback.`;
}

router.get("/product/:productId/summarize", async (req, res) => {
  let comments = [];
  try {
    comments = await Comment.find({ productId: req.params.productId }).sort({ createdAt: -1 });

    if (!comments.length) {
      return res.json({ summary: "No reviews yet for this product.", sampleSize: 0, averageRating: 0, aiGenerated: false });
    }

    const ratings = comments.map((c) => Number(c.rating || 0));
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const sampleSize = comments.length;
    const averageRating = Number(avg.toFixed(1));

    // Fallback if no Groq API key
    if (!process.env.GROQ_API_KEY) {
      return res.json({
        summary: basicFallbackSummary(comments, avg),
        sampleSize,
        averageRating,
        aiGenerated: false
      });
    }

    const reviewLines = comments.slice(0, 15).map((c, i) =>
      `Review ${i + 1} (${c.rating}/5 stars): "${c.text}"`
    ).join("\n");

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: `You are a helpful shopping assistant. Summarize the following product reviews in 2-3 clear sentences. Highlight what buyers liked, any common complaints, and whether you would recommend the product. Write only the summary with no intro phrases.

Reviews (${sampleSize} total, average rating: ${averageRating}/5):
${reviewLines}`
          }
        ],
        max_tokens: 200,
        temperature: 0.6
      })
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok) {
      throw new Error(groqData?.error?.message || "Groq API error");
    }

    const generated = groqData.choices?.[0]?.message?.content?.trim();
    if (!generated) throw new Error("Empty response from Groq");

    return res.json({
      summary: generated,
      sampleSize,
      averageRating,
      aiGenerated: true
    });
  } catch (err) {
    console.error("[AI Summary] Error:", err.message);
    // Always return a usable response rather than 500
    const ratings = comments.map((c) => Number(c.rating || 0));
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    return res.json({
      summary: basicFallbackSummary(comments, avg),
      sampleSize: comments.length,
      averageRating: Number(avg.toFixed(1)),
      aiGenerated: false,
      debug: err.message
    });
  }
});

module.exports = router;