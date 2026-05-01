const axios = require("axios");

const AFFILIATE_MAP = {
  "Finance / Credit": "👉 Build credit free: https://kikoff.pxf.io/c/7007975/2344833/14994",
  "Spirituality / Numerology": "🌙 Get your Life Blueprint: https://oracelis.app",
  "Self-Help": "📖 Books by Eric Coste: https://payhip.com/ericcoste",
  "Lifestyle": "✨ Shop my picks: https://amazon.com/?tag=ericcoste-20",
  "Product Review": "🛒 Link in bio | Amazon: https://amazon.com/?tag=ericcoste-20",
};

async function generateCaption(filename, niche) {
  const affiliateHint = AFFILIATE_MAP[niche] || "";

  const prompt = `You are a social media caption writer for a finance/spirituality creator brand.

File: ${filename}
Niche: ${niche}
Affiliate CTA to append (always include at end): ${affiliateHint}

Write a scroll-stopping caption for this content. Rules:
- 2-3 punchy sentences max
- Hook in the first 5 words
- End with the affiliate CTA on its own line
- Add 5-7 niche hashtags on the last line

Return ONLY valid JSON:
{"caption": "full caption text here including CTA", "tags": "#tag1 #tag2 #tag3 #tag4 #tag5"}

No markdown. No explanation. JSON only.`;

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ebssweb.com",
          "X-Title": "EBSS Autoposter",
        },
      }
    );

    const text = res.data.choices[0].message.content;
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("[caption] DeepSeek error:", err.message);
    return {
      caption: `New ${niche} content dropping. Stay tuned!\n${affiliateHint}`,
      tags: "#content #fyp #viral",
    };
  }
}

module.exports = { generateCaption };
