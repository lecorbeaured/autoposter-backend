require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { getDb } = require("./db");
const { generateCaption } = require("./caption");
const { dispatchPost } = require("./poster");
const { sendAlert, postReport } = require("./telegram");

const app = express();
const PORT = process.env.PORT || 3000;
const MEDIA_DIR = process.env.MEDIA_DIR || "./media-queue";

// Ensure media dir exists
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: MEDIA_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// ── ROUTES ───────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Get all posts
app.get("/posts", (req, res) => {
  const db = getDb();
  const posts = db.prepare("SELECT * FROM posts ORDER BY created_at DESC LIMIT 100").all();
  res.json(posts.map(p => ({ ...p, platforms: JSON.parse(p.platforms), results: JSON.parse(p.results) })));
});

// Upload media + add to queue
app.post("/posts", upload.single("file"), async (req, res) => {
  try {
    const { niche, caption, tags, platforms, scheduled_at } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const type = file.mimetype.startsWith("video") ? "video" : "image";
    let finalCaption = caption;
    let finalTags = tags;

    // Auto-generate if no caption provided
    if (!finalCaption) {
      const generated = await generateCaption(file.originalname, niche || "Lifestyle");
      finalCaption = generated.caption;
      finalTags = generated.tags;
    }

    const db = getDb();
    const platformList = JSON.parse(platforms || '["youtube","tiktok","instagram","twitter","pinterest","facebook"]');

    const result = db.prepare(`
      INSERT INTO posts (filename, filepath, type, niche, caption, tags, platforms, status, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.originalname,
      file.path,
      type,
      niche || "Lifestyle",
      finalCaption,
      finalTags || "",
      JSON.stringify(platformList),
      scheduled_at ? "scheduled" : "draft",
      scheduled_at || null
    );

    await sendAlert(`📥 *New post queued*\n📁 ${file.originalname}\n🎯 ${niche}\n📅 ${scheduled_at || "Manual"}`);

    res.json({ id: result.lastInsertRowid, caption: finalCaption, tags: finalTags });
  } catch (err) {
    console.error("[/posts POST]", err);
    res.status(500).json({ error: err.message });
  }
});

// Generate caption only (no file)
app.post("/caption", async (req, res) => {
  try {
    const { filename, niche } = req.body;
    const result = await generateCaption(filename, niche || "Lifestyle");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update post
app.patch("/posts/:id", (req, res) => {
  const db = getDb();
  const { caption, tags, platforms, status, scheduled_at } = req.body;
  db.prepare(`
    UPDATE posts SET caption=COALESCE(?,caption), tags=COALESCE(?,tags),
    platforms=COALESCE(?,platforms), status=COALESCE(?,status),
    scheduled_at=COALESCE(?,scheduled_at) WHERE id=?
  `).run(caption, tags, platforms ? JSON.stringify(platforms) : null, status, scheduled_at, req.params.id);
  res.json({ ok: true });
});

// Delete post
app.delete("/posts/:id", (req, res) => {
  const db = getDb();
  const post = db.prepare("SELECT filepath FROM posts WHERE id=?").get(req.params.id);
  if (post?.filepath && fs.existsSync(post.filepath)) fs.unlinkSync(post.filepath);
  db.prepare("DELETE FROM posts WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Manual trigger post now
app.post("/posts/:id/post-now", async (req, res) => {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });

  db.prepare("UPDATE posts SET status='processing' WHERE id=?").run(post.id);
  res.json({ ok: true, message: "Posting started" });

  // Run async
  runPost(post);
});

// Get logs
app.get("/logs", (req, res) => {
  const db = getDb();
  const logs = db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 200").all();
  res.json(logs);
});

// ── SCHEDULER ────────────────────────────────────────────────────
// Every minute: check for posts scheduled in the past that are still 'scheduled'
cron.schedule("* * * * *", async () => {
  const db = getDb();
  const now = new Date().toISOString();
  const due = db.prepare(`
    SELECT * FROM posts
    WHERE status = 'scheduled'
    AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
    LIMIT 3
  `).all(now);

  for (const post of due) {
    console.log(`[cron] Due post: ${post.filename}`);
    await runPost(post);
  }
});

// Daily 8 AM summary
cron.schedule("0 8 * * *", async () => {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const posted = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='posted' AND posted_at LIKE ?").get(`${today}%`);
  const failed = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='failed' AND posted_at LIKE ?").get(`${today}%`);
  await sendAlert(`📊 *Daily Summary*\n✅ Posted: ${posted.c}\n❌ Failed: ${failed.c}\n⏱ Scheduled: check dashboard`);
});

// ── POST RUNNER ───────────────────────────────────────────────────
async function runPost(post) {
  const db = getDb();
  try {
    db.prepare("UPDATE posts SET status='processing' WHERE id=?").run(post.id);
    const results = await dispatchPost(post);

    const allOk = Object.values(results).every(r => r.success);
    const anyOk = Object.values(results).some(r => r.success);

    db.prepare("UPDATE posts SET status=?, results=?, posted_at=? WHERE id=?").run(
      allOk ? "posted" : anyOk ? "partial" : "failed",
      JSON.stringify(results),
      new Date().toISOString(),
      post.id
    );

    // Log each platform result
    for (const [platform, result] of Object.entries(results)) {
      db.prepare("INSERT INTO logs (post_id, platform, success, message) VALUES (?,?,?,?)").run(
        post.id, platform, result.success ? 1 : 0, result.message
      );
    }

    await postReport(results);
  } catch (err) {
    console.error("[runPost]", err);
    db.prepare("UPDATE posts SET status='failed' WHERE id=?").run(post.id);
    await sendAlert(`❌ *Post failed*\n${post.filename}\n${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[autoposter] Backend running on port ${PORT}`);
  sendAlert(`🟢 *Autoposter backend started*\nPort: ${PORT}`);
});
