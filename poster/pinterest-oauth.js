const axios = require("axios");

const CLIENT_ID = process.env.PINTEREST_APP_ID || "1566909";
const CLIENT_SECRET = process.env.PINTEREST_APP_SECRET;
const REDIRECT_URI = "https://autoposter-backend-production-3183.up.railway.app/auth/pinterest/callback";

function getAuthUrl() {
  const scopes = "pins:read,pins:write,boards:read,user_accounts:read";
  return `https://www.pinterest.com/oauth/?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes}`;
}

async function exchangeCode(code) {
  const res = await axios.post(
    "https://api.pinterest.com/v5/oauth/token",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
    {
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return res.data;
}

module.exports = { getAuthUrl, exchangeCode };
