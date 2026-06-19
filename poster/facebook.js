const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const SESSION_FILE = path.join(__dirname, "../sessions/facebook-session.json");
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

async function saveSession(page) {
  const cookies = await page.cookies();
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
}

async function loadSession(page) {
  if (!fs.existsSync(SESSION_FILE)) return false;
  const cookies = JSON.parse(fs.readFileSync(SESSION_FILE));
  await page.setCookie(...cookies);
  return true;
}

async function isLoggedIn(page) {
  try {
    await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const url = page.url();
    if (url.includes("/login") || url.includes("login.php")) return false;
    return true;
  } catch { return false; }
}

async function login(page) {
  const username = process.env.META_USERNAME;
  const password = process.env.META_PASSWORD;
  if (!username || !password) throw new Error("META_USERNAME and META_PASSWORD env vars required");
  await page.goto("https://www.facebook.com/login", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.type('#email', username, { delay: 80 });
  await page.type('#pass', password, { delay: 80 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('#loginbutton');
  await new Promise(r => setTimeout(r, 5000));
  await saveSession(page);
}

async function postToFacebook(filepath, caption, tags, type) {
  const message = `${caption}\n\n${tags}`;
  const pageId = process.env.META_PAGE_ID;
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROMIUM_PATH,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-zygote"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    const sessionLoaded = await loadSession(page);
    if (sessionLoaded) {
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) await login(page);
    } else {
      await login(page);
    }
    const pageUrl = pageId ? `https://www.facebook.com/${pageId}` : "https://www.facebook.com/";
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    if (type === "video") {
      await postMedia(page, filepath, message);
    } else {
      await postMedia(page, filepath, message);
    }
    await saveSession(page);
    await browser.close();
    return { success: true, message: `Posted to Facebook (${type}): ${path.basename(filepath)}` };
  } catch (err) {
    if (browser) await browser.close();
    return { success: false, message: `Facebook Puppeteer error: ${err.message}` };
  }
}

async function postMedia(page, filepath, message) {
  const photoSelectors = ['[aria-label="Photo/video"]'];
  let clicked = false;
  for (const sel of photoSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      clicked = true;
      break;
    } catch {}
  }
  if (!clicked) {
    const [photoBtn] = await page.$x('//span[contains(text(),"Photo")]');
    if (photoBtn) { await photoBtn.click(); clicked = true; }
  }
  if (!clicked) throw new Error("Could not find Photo/video button");
  await new Promise(r => setTimeout(r, 2000));
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("No file input found");
  await input.uploadFile(filepath);
  await new Promise(r => setTimeout(r, 5000));
  await typeCaption(page, message);
  await new Promise(r => setTimeout(r, 1000));
  await clickPost(page);
  await new Promise(r => setTimeout(r, 6000));
}

async function typeCaption(page, message) {
  const selectors = ['[aria-label="What\'s on your mind?"]','[contenteditable="true"]','div[role="textbox"]'];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      await page.keyboard.type(message, { delay: 20 });
      return;
    } catch {}
  }
}

async function clickPost(page) {
  const selectors = ['[aria-label="Post"]','div[aria-label="Post"]'];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      return;
    } catch {}
  }
  const [postBtn] = await page.$x('//div[@role="button"][contains(text(),"Post")]');
  if (postBtn) await postBtn.click();
}

module.exports = { postToFacebook };
