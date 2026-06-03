const axios = require("axios");
const fs = require("fs");
const { getPublicUrl, scheduleDelete } = require("./upload-helper");

async function postToInstagram(filepath, caption, tags, type) {
  try {
    const igUserId = process.env.META_IG_USER_ID;
    const token = process.env.META_ACCESS_TOKEN;
    const fullCaption = `${caption}\n\n${tags}`;

    // If filepath is a local file, convert to public URL
    let mediaUrl = filepath;
    let isLocal = false;
    if (!filepath.startsWith("http")) {
      if (!fs.existsSync(filepath)) {
        return { success: false, message: `File not found: ${filepath}` };
      }
      mediaUrl = getPublicUrl(filepath);
      isLocal = true;
    }

    if (type === "video") {
      const uploadRes = await axios.post(
        `https://graph.facebook.com/v25.0/${igUserId}/media`,
        {
          media_type: "REELS",
          video_url: mediaUrl,
          caption: fullCaption,
          access_token: token,
        }
      );
      const creationId = uploadRes.data.id;

      // Poll for video processing (up to 60s)
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 12) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await axios.get(
          `https://graph.facebook.com/v25.0/${creationId}`,
          { params: { fields: "status_code", access_token: token } }
        );
        status = check.data.status_code;
        attempts++;
      }

      if (status !== "FINISHED") {
        return { success: false, message: `Video processing failed: ${status}` };
      }

      const publishRes = await axios.post(
        `https://graph.facebook.com/v25.0/${igUserId}/media_publish`,
        { creation_id: creationId, access_token: token }
      );

      if (isLocal) scheduleDelete(filepath);
      return { success: true, message: `Posted Reel: ${publishRes.data.id}` };

    } else {
      const uploadRes = await axios.post(
        `https://graph.facebook.com/v25.0/${igUserId}/media`,
        {
          image_url: mediaUrl,
          caption: fullCaption,
          access_token: token,
        }
      );
      const creationId = uploadRes.data.id;

      const publishRes = await axios.post(
        `https://graph.facebook.com/v25.0/${igUserId}/media_publish`,
        { creation_id: creationId, access_token: token }
      );

      if (isLocal) scheduleDelete(filepath);
      return { success: true, message: `Posted image: ${publishRes.data.id}` };
    }
  } catch (err) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

module.exports = { postToInstagram };
