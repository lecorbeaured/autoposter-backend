const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const BASE = "https://graph.facebook.com/v19.0";

// ── FACEBOOK ─────────────────────────────────────────────────────
async function postToFacebook(filepath, caption, tags, type) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const text = `${caption}\n\n${tags}`;

    if (type === "video") {
      const form = new FormData();
      form.append("source", fs.createReadStream(filepath));
      form.append("description", text);
      form.append("access_token", token);

      const res = await axios.post(`${BASE}/${pageId}/videos`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return { success: true, message: `FB video posted: ${res.data.id}` };
    } else {
      const form = new FormData();
      form.append("source", fs.createReadStream(filepath));
      form.append("caption", text);
      form.append("access_token", token);

      const res = await axios.post(`${BASE}/${pageId}/photos`, form, {
        headers: form.getHeaders(),
      });
      return { success: true, message: `FB photo posted: ${res.data.id}` };
    }
  } catch (err) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

// ── INSTAGRAM ─────────────────────────────────────────────────────
async function postToInstagram(filepath, caption, tags, type) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const igId = process.env.META_IG_USER_ID;
    const text = `${caption}\n\n${tags}`;

    // Step 1: Create container
    const containerPayload = {
      caption: text,
      access_token: token,
    };

    if (type === "video") {
      // Instagram Reels require a public video URL — host on Railway volume with public route
      // For now we flag this for manual URL upload
      containerPayload.media_type = "REELS";
      containerPayload.video_url = filepath; // Must be a public URL in production
      containerPayload.share_to_feed = true;
    } else {
      containerPayload.image_url = filepath; // Must be a public URL in production
    }

    const containerRes = await axios.post(
      `${BASE}/${igId}/media`,
      containerPayload
    );
    const containerId = containerRes.data.id;

    // Step 2: Poll until ready
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await axios.get(`${BASE}/${containerId}`, {
        params: { fields: "status_code", access_token: token },
      });
      if (statusRes.data.status_code === "FINISHED") { ready = true; break; }
      if (statusRes.data.status_code === "ERROR") break;
    }

    if (!ready) return { success: false, message: "Container processing timed out" };

    // Step 3: Publish
    const pubRes = await axios.post(`${BASE}/${igId}/media_publish`, {
      creation_id: containerId,
      access_token: token,
    });

    return { success: true, message: `IG posted: ${pubRes.data.id}` };
  } catch (err) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

module.exports = { postToFacebook, postToInstagram };
