const axios = require("axios");
const fs = require("fs");

async function postToTikTok(filepath, caption, tags, type) {
  try {
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    const text = `${caption}\n\n${tags}`.slice(0, 2200);
    const fileSize = fs.statSync(filepath).size;

    // Step 1: Init upload
    const initRes = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: text,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: fileSize,
          chunk_size: fileSize,
          total_chunk_count: 1,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { publish_id, upload_url } = initRes.data.data;

    // Step 2: Upload chunk
    const fileBuffer = fs.readFileSync(filepath);
    await axios.put(upload_url, fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
        "Content-Length": fileSize,
      },
    });

    // Step 3: Poll publish status
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await axios.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        { publish_id },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const status = statusRes.data.data?.status;
      if (status === "PUBLISH_COMPLETE") return { success: true, message: `TikTok posted: ${publish_id}` };
      if (status === "FAILED") return { success: false, message: "TikTok publish failed" };
    }

    return { success: false, message: "TikTok publish timed out" };
  } catch (err) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

module.exports = { postToTikTok };
