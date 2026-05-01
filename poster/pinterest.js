const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

async function postToPinterest(filepath, caption, tags, type) {
  try {
    const token = process.env.PINTEREST_ACCESS_TOKEN;
    const boardId = process.env.PINTEREST_BOARD_ID;
    const title = caption.split("\n")[0].slice(0, 100);

    // Upload media first
    const form = new FormData();
    form.append("media", fs.createReadStream(filepath));

    const uploadRes = await axios.post(
      "https://api.pinterest.com/v5/media",
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
      }
    );

    const mediaId = uploadRes.data.media_id;

    // Wait for media to process
    await new Promise(r => setTimeout(r, 4000));

    // Create pin
    const pinRes = await axios.post(
      "https://api.pinterest.com/v5/pins",
      {
        board_id: boardId,
        title,
        description: `${caption}\n\n${tags}`,
        media_source: {
          source_type: "media_id",
          media_id: mediaId,
        },
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    return { success: true, message: `Pin created: ${pinRes.data.id}` };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

module.exports = { postToPinterest };
