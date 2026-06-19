const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const SESSION_FILE = path.join(__dirname, "../sessions/instagram-session.json");
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
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const url = page.url();
    if (url.includes("/accounts/login")) return false;
    return true;
  } catch { return false; }
}

async function login(page) {
  const username = process.env.META_USERNAME;
  const password = process.env.META_PASSWORD;
  if (!username || !password) throw new Error("META_USERNAME and META_PASSWORD env vars required");
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.type('input[name="username"]', username, { delay: 80 });
  await page.type('input[name="password"]', password, { delay: 80 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 5000));
  await saveSession(page);
}

async function postToInstagram(filepath, caption, tags, type) {
  const fullCaption = `${caption}\n\n${tags}`;
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
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    let clicked = false;
    const createSelectors = ['svg[aria-label="New post"]','[aria-label="New post"]'];
    for (const sel of createSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.click(sel);
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) {
      const [createBtn] = await page.$x('//span[contains(text(),"Create")]');
      if (createBtn) { await createBtn.click(); clicked = true; }
    }
    if (!clicked) throw new Error("Could not find Create button");
    await new Promise(r => setTimeout(r, 2000));
    const input = await page.$('input[type="file"]');
    if (!input) throw new Error("No file input found");
    await input.uploadFile(filepath);
    await new Promise(r => setTimeout(r, 4000));
    await clickNext(page);
    await new Promise(r => setTimeout(r, 2000));
    await clickNext(page);
    await new Promise(r => setTimeout(r, 2000));
    const captionBox = await page.$('div[aria-label="Write a caption..."]');
    if (captionBox) {
      await captionBox.click();
      await page.keyboard.type(fullCaption, { delay: 30 });
    }
    await new Promise(r => setTimeout(r, 1000));
    const [shareBtn] = await page.$x('//div[contains(text(),"Share")]') || await page.$x('//button[contains(text(),"Share")]');
    if (shareBtn) await shareBtn.click();
    await new Promise(r => setTimeout(r, 6000));
    await saveSession(page);
    await browser.close();
    return { success: true, message: `Posted to Instagram (${type}): ${path.basename(filepath)}` };
  } catch (err) {
    if (browser) await browser.close();
    return { success: false, message: `Instagram Puppeteer error: ${err.message}` };
  }
}

async function clickNext(page) {
  const [nextBtn] = await page.$x('//button[contains(text(),"Next")]');
  if (nextBtn) await nextBtn.click();
}

module.exports = { postToInstagram };
