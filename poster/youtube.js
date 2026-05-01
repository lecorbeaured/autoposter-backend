const { google } = require("googleapis");
const fs = require("fs");

function getClient() {
  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: "v3", auth });
}

async function postToYouTube(filepath, caption, tags, type) {
  try {
    const youtube = getClient();
    const title = caption.split("\n")[0].slice(0, 100);
    const tagList = tags.split(" ").map(t => t.replace("#", "")).filter(Boolean);

    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: `${title} #Shorts`,
          description: caption,
          tags: tagList,
          categoryId: "22",
        },
        status: { privacyStatus: "public" },
      },
      media: {
        body: fs.createReadStream(filepath),
      },
    });

    return { success: true, message: `Posted: https://youtube.com/watch?v=${res.data.id}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { postToYouTube };
