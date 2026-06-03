const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

async function postToFacebook(filepath, caption, tags, type) {
  try {
    const pageId = process.env.META_PAGE_ID;
    const token = process.env.META_ACCESS_TOKEN;
    const message = `${caption}\n\n${tags}`;

    if (type === "video") {
      const fileSize = fs.statSync(filepath).size;

      const initRes = await axios.post(
        `https://graph.facebook.com/v25.0/${pageId}/videos`,
        null,
        {
          params: {
            upload_phase: "start",
            file_size: fileSize,
            access_token: token,
          },
        }
      );

      const uploadSessionId = initRes.data.upload_session_id;
      const startOffset = parseInt(initRes.data.start_offset);
      const endOffset = parseInt(initRes.data.end_offset);

      const fileBuffer = fs.readFileSync(filepath);
      const chunk = fileBuffer.slice(startOffset, endOffset);

      const form = new FormData();
      form.append("upload_phase", "transfer");
      form.append("upload_session_id", uploadSessionId);
      form.append("start_offset", startOffset.toString());
      form.append("video_file_chunk", chunk, {
        filename: "chunk.mp4",
        contentType: "video/mp4",
      });
      form.append("access_token", token);

      await axios.post(
        `https://graph.facebook.com/v25.0/${pageId}/videos`,
        form,
        { headers: form.getHeaders() }
      );

      const finishRes = await axios.post(
        `https://graph.facebook.com/v25.0/${pageId}/videos`,
        null,
        {
          params: {
            upload_phase: "finish",
            upload_session_id: uploadSessionId,
            description: message,
            access_token: token,
          },
        }
      );

      const videoId = finishRes.data.video_id || finishRes.data.id || uploadSessionId;
      return { success: true, message: `Posted video: ${videoId}` };
    } else {
      const res = await axios.post(
        `https://graph.facebook.com/v25.0/${pageId}/photos`,
        null,
        {
          params: {
            url: filepath,
            caption: message,
            access_token: token,
          },
        }
      );
      return { success: true, message: `Posted photo: ${res.data.id}` };
    }
  } catch (err) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

module.exports = { postToFacebook };
