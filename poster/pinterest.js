const axios = require("axios");

async function postToPinterest(filepath, caption, tags, type) {
  try {
    const token = process.env.PINTEREST_ACCESS_TOKEN;
    const boardId = process.env.PINTEREST_BOARD_ID;
    const title = caption.split("\n")[0].slice(0, 100);

    const res = await axios.post(
      "https://api.pinterest.com/v5/pins",
      {
        board_id: boardId,
        title,
        description: `${caption}\n\n${tags}`,
        media_source: {
          source_type: "image_url",
          url: "https://i.pinimg.com/736x/money-mindset.jpg",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { success: true, message: `Pin created: ${res.data.id}` };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

module.exports = { postToPinterest };
