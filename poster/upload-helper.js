const fs = require('fs');
const path = require('path');

const MEDIA_DIR = process.env.MEDIA_DIR || (
  fs.existsSync('/data') ? '/data/media-queue' : './media-queue'
);

// Ensure dir exists
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const PUBLIC_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://autoposter-backend-production-3183.up.railway.app';

function getPublicUrl(filepath) {
  const filename = path.basename(filepath);
  const dest = path.join(MEDIA_DIR, filename);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(filepath, dest);
  }
  return `${PUBLIC_URL}/media/${filename}`;
}

function scheduleDelete(filepath, ttl = 60 * 60 * 1000) {
  const dest = path.join(MEDIA_DIR, path.basename(filepath));
  setTimeout(() => {
    try {
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
        console.log(`[upload-helper] Deleted: ${dest}`);
      }
    } catch (e) {
      console.error(`[upload-helper] Failed to delete ${dest}:`, e.message);
    }
  }, ttl);
}

module.exports = { getPublicUrl, scheduleDelete, MEDIA_DIR };
