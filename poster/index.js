const { postToYouTube } = require("./youtube");
const { postToTwitter } = require("./twitter");
const { postToPinterest } = require("./pinterest");
const { postToFacebook } = require("./facebook");
const { postToInstagram } = require("./instagram");
const { postToTikTok } = require("./tiktok");

const HANDLERS = {
  youtube:   (fp, cap, tags, type) => postToYouTube(fp, cap, tags, type),
  twitter:   (fp, cap, tags, type) => postToTwitter(fp, cap, tags, type),
  pinterest: (fp, cap, tags, type) => postToPinterest(fp, cap, tags, type),
  facebook:  (fp, cap, tags, type) => postToFacebook(fp, cap, tags, type),
  instagram: (fp, cap, tags, type) => postToInstagram(fp, cap, tags, type),
  tiktok:    (fp, cap, tags, type) => postToTikTok(fp, cap, tags, type),
};

async function dispatchPost(post) {
  const platforms = JSON.parse(post.platforms || "[]");
  const results = {};

  for (const platform of platforms) {
    if (!HANDLERS[platform]) {
      results[platform] = { success: false, message: "No handler for this platform" };
      continue;
    }
    console.log(`[poster] Posting to ${platform}: ${post.filename}`);
    results[platform] = await HANDLERS[platform](
      post.filepath,
      post.caption,
      post.tags,
      post.type
    );
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

module.exports = { dispatchPost };
