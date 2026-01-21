const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No URL provided" });

    let browser;
    let responseSent = false;

    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // 1. Resource Blocking for maximum speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // 2. Setup a Promise that resolves as soon as the API is found
        const waitForApi = new Promise(async (resolve, reject) => {
            // Set a hard timeout of 30 seconds
            const timeout = setTimeout(() => resolve(null), 30000);

            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('fetch-video')) {
                    try {
                        const text = await response.text();
                        const json = JSON.parse(text);
                        clearTimeout(timeout);
                        resolve(json); // This triggers the "Instant" return
                    } catch (e) {
                        // Ignore parse errors from other requests
                    }
                }
            });
        });

        // 3. Start navigation
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

        // 4. Trigger scrolling (Terabox often needs this to fire APIs)
        await page.evaluate(() => {
            window.scrollBy(0, 1000);
        });

        // 5. Wait for the API promise to finish (either data found or 30s timeout)
        const result = await waitForApi;

        if (result) {
            responseSent = true;
            return res.json({ success: true, data: result });
        } else {
            responseSent = true;
            return res.status(404).json({ success: false, error: "API not found within 30s" });
        }

    } catch (err) {
        if (!responseSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => console.log(`Instant-Trace API on port ${PORT}`));
  
