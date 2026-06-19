const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const SESSION_FILE = "/data/sessions/facebook-session.json";
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

async function saveSession(page) {
  const cookies = await page.cookies();
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
  console.log("[fb] session saved to " + SESSION_FILE);
}

async function loadSession(page) {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log("[fb] no session file found, will login fresh");
    return false;
  }
  try {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE));
    await page.setCookie(...cookies);
    console.log("[fb] session loaded, " + cookies.length + " cookies");
    return true;
  } catch { return false; }
}

async function isLoggedIn(page) {
  try {
    await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const url = page.url();
    console.log("[fb] post-session URL: " + url);
    if (url.includes("/login") || url.includes("login.php")) return false;
    const content = await page.content();
    if (content.includes("Log In") && content.includes("Create new account") && !content.includes("What's on your mind")) return false;
    return true;
  } catch { return false; }
}

async function findElement(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) return el;
    } catch {}
  }
  return null;
}

async function login(page) {
  const username = process.env.META_USERNAME;
  const password = process.env.META_PASSWORD;
  if (!username || !password) throw new Error("META_USERNAME and META_PASSWORD env vars required");

  console.log("[fb] logging in as " + username);
  await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const emailField = await findElement(page, ["#email", 'input[name="email"]', 'input[type="email"]']);
  if (!emailField) throw new Error("Could not find email field");
  await emailField.click({ clickCount: 3 });
  await emailField.type(username, { delay: 80 });

  const passField = await findElement(page, ["#pass", 'input[name="pass"]', 'input[type="password"]']);
  if (!passField) throw new Error("Could not find password field");
  await passField.click({ clickCount: 3 });
  await passField.type(password, { delay: 80 });
  await new Promise(r => setTimeout(r, 500));
  await passField.press("Enter");
  await new Promise(r => setTimeout(r, 8000));

  const url = page.url();
  console.log("[fb] post-login URL: " + url);
  await saveSession(page);
}

async function postToFacebook(filepath, caption, tags, type) {
  const message = caption + "\n\n" + tags;
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
      if (!loggedIn) {
        console.log("[fb] session invalid, logging in fresh");
        await login(page);
      } else {
        console.log("[fb] session valid, skipping login");
      }
    } else {
      await login(page);
    }

    const pageUrl = pageId ? "https://www.facebook.com/" + pageId : "https://www.facebook.com/";
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const ariaLabels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("[aria-label]"))
        .map(el => el.getAttribute("aria-label"))
        .filter(Boolean)
        .slice(0, 40);
    });
    console.log("[fb] aria-labels after login:", JSON.stringify(ariaLabels));

    await postMedia(page, filepath, message);
    await saveSession(page);
    await browser.close();
    return { success: true, message: "Posted to Facebook (" + type + "): " + path.basename(filepath) };
  } catch (err) {
    if (browser) await browser.close();
    return { success: false, message: "Facebook Puppeteer error: " + err.message };
  }
}

async function postMedia(page, filepath, message) {
  const photoSelectors = [
    '[aria-label="Photo/video"]',
    '[aria-label="Photo or video"]',
    '[aria-label="Photos/videos"]',
    '[aria-label="Add photo or video"]',
  ];

  let clicked = false;
  for (const sel of photoSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel);
      clicked = true;
      console.log("[fb] clicked photo button: " + sel);
      break;
    } catch {}
  }

  if (!clicked) {
    const allButtons = await page.$$('div[role="button"]');
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.innerText || el.textContent, btn);
      if (text && text.toLowerCase().includes("photo")) {
        await btn.click();
        clicked = true;
        console.log("[fb] clicked photo button by text: " + text.trim());
        break;
      }
    }
  }

  if (!clicked) throw new Error("Could not find Photo/video button");

  await new Promise(r => setTimeout(r, 2000));
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("No file input found");
  await input.uploadFile(filepath);
  await new Promise(r => setTimeout(r, 5000));

  const captionEl = await findElement(page, [
    '[aria-label="What\'s on your mind?"]',
    'div[role="textbox"]',
    '[contenteditable="true"]',
  ]);
  if (captionEl) {
    await captionEl.click();
    await page.keyboard.type(message, { delay: 20 });
  }
  await new Promise(r => setTimeout(r, 1000));

  const postSelectors = ['[aria-label="Post"]', 'div[aria-label="Post"]'];
  let posted = false;
  for (const sel of postSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      posted = true;
      break;
    } catch {}
  }
  if (!posted) throw new Error("Could not find Post button");
  await new Promise(r => setTimeout(r, 6000));
}

module.exports = { postToFacebook };
