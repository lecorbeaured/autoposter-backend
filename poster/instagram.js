const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const SESSION_FILE = path.join(__dirname, "../sessions/instagram-session.json");

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
    const content = await page.content();
    // If redirected to login or sees login form, not logged in
    if (url.includes("/accounts/login") || content.includes('"is_authenticated":false')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function login(page) {
  const username = process.env.META_USERNAME;
  const password = process.env.META_PASSWORD;

  if (!username || !password) {
    throw new Error("META_USERNAME and META_PASSWORD env vars required");
  }

  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 2000));

  await page.type('input[name="username"]', username, { delay: 80 });
  await page.type('input[name="password"]', password, { delay: 80 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 5000));

  // Handle "Save login info" prompt
  try {
    const saveBtn = await page.$('button:has-text("Save Info")') ||
                    await page.$x('//button[contains(text(),"Save Info")]');
    if (saveBtn && saveBtn[0]) await saveBtn[0].click();
  } catch {}

  // Handle "Turn on notifications" prompt
  try {
    const notNow = await page.$x('//button[contains(text(),"Not Now")]');
    if (notNow && notNow[0]) await notNow[0].click();
  } catch {}

  await new Promise(r => setTimeout(r, 3000));
  await saveSession(page);
}

async function postToInstagram(filepath, caption, tags, type) {
  const fullCaption = `${caption}\n\n${tags}`;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    const sessionLoaded = await loadSession(page);
    if (sessionLoaded) {
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) await login(page);
    } else {
      await login(page);
    }

    // Navigate to home and open create post
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Click the Create/+ button
    const createSelectors = [
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'a[href="/create/style/"]',
    ];

    let clicked = false;
    for (const sel of createSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.click(sel);
        clicked = true;
        break;
      } catch {}
    }

    if (!clicked) {
      // Try clicking by text
      const [createBtn] = await page.$x('//span[contains(text(),"Create")]');
      if (createBtn) {
        await createBtn.click();
        clicked = true;
      }
    }

    if (!clicked) throw new Error("Could not find Create button");

    await new Promise(r => setTimeout(r, 2000));

    // Upload file via file input
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 10000 }),
      page.click('button:has-text("Select from computer")').catch(async () => {
        // fallback: find and click the file input directly
        const input = await page.$('input[type="file"]');
        if (input) await input.click();
      }),
    ]).catch(async () => {
      // Direct file input approach
      const input = await page.$('input[type="file"]');
      return [{ accept: (files) => input.uploadFile(...files) }];
    });

    if (fileChooser) {
      await fileChooser.accept([filepath]);
    } else {
      const input = await page.$('input[type="file"]');
      if (!input) throw new Error("No file input found");
      await input.uploadFile(filepath);
    }

    await new Promise(r => setTimeout(r, 4000));

    // Handle crop screen - click Next
    await clickNext(page);
    await new Promise(r => setTimeout(r, 2000));

    // Handle filter screen - click Next
    await clickNext(page);
    await new Promise(r => setTimeout(r, 2000));

    // Caption screen - type caption
    const captionBox = await page.$('div[aria-label="Write a caption..."]') ||
                       await page.$('textarea[aria-label="Write a caption..."]');
    if (captionBox) {
      await captionBox.click();
      await page.keyboard.type(fullCaption, { delay: 30 });
    }

    await new Promise(r => setTimeout(r, 1000));

    // Click Share
    const [shareBtn] = await page.$x('//div[contains(text(),"Share")]') ||
                       await page.$x('//button[contains(text(),"Share")]');
    if (shareBtn) {
      await shareBtn.click();
    } else {
      const shareButtons = await page.$$('button');
      for (const btn of shareButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.trim() === "Share") {
          await btn.click();
          break;
        }
      }
    }

    // Wait for post confirmation
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
  const nextSelectors = [
    'button:has-text("Next")',
    '[aria-label="Next"]',
  ];
  for (const sel of nextSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      return;
    } catch {}
  }
  // XPath fallback
  const [nextBtn] = await page.$x('//button[contains(text(),"Next")]');
  if (nextBtn) await nextBtn.click();
}

module.exports = { postToInstagram };
