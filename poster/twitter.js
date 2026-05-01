const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");

function getClient() {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
}

async function postToTwitter(filepath, caption, tags, type) {
  try {
    const client = getClient().readWrite;
    const text = `${caption}\n\n${tags}`.slice(0, 280);

    let mediaId;
    if (filepath && fs.existsSync(filepath)) {
      const fileBuffer = fs.readFileSync(filepath);
      const mimeType = type === "video" ? "video/mp4" : "image/jpeg";
      mediaId = await client.v1.uploadMedia(fileBuffer, { mimeType });
    }

    const tweet = await client.v2.tweet({
      text,
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    });

    return { success: true, message: `Posted: https://x.com/i/web/status/${tweet.data.id}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { postToTwitter };
