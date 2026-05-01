const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7477833460";

async function sendAlert(message) {
  if (!BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[telegram] Failed:", err.message);
  }
}

async function postReport(results) {
  const lines = ["📡 *AUTOPOSTER REPORT*", ""];
  for (const [platform, result] of Object.entries(results)) {
    const icon = result.success ? "✅" : "❌";
    lines.push(`${icon} *${platform.toUpperCase()}*: ${result.message}`);
  }
  await sendAlert(lines.join("\n"));
}

module.exports = { sendAlert, postReport };
