const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const startTime = Date.now(); // Start the clock
    const targetUrl = req.query.url;

    if (!targetUrl) return res.status(400).json({ error: "No URL provided" });

    let browser;
    let responseSent = false;

    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome', // Standard path for Linux/Render
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

        // 1. Resource Blocking (Speeds up loading significantly)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // 2. The "Instant Capture" Promise
        const waitForApi = new Promise(async (resolve) => {
            // Hard timeout after 30 seconds
            const timeout = setTimeout(() => resolve(null), 30000);

            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('fetch-video')) {
                    try {
                        const text = await response.text();
                        const json = JSON.parse(text);
                        clearTimeout(timeout);
                        resolve(json); 
                    } catch (e) {
                        // Ignore errors from non-target requests
                    }
                }
            });
        });

        // 3. Navigation
        // We use catch to prevent the script from crashing if the page times out
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

        // 4. Trigger actions (Scrolling)
        await page.evaluate(() => window.scrollBy(0, 800));

        // 5. Wait for result
        const result = await waitForApi;
        
        // Calculate final duration
        const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

        if (result) {
            responseSent = true;
            return res.json({ 
                success: true, 
                time_taken: `${durationSeconds}s`,
                data: result 
            });
        } else {
            responseSent = true;
            return res.status(404).json({ 
                success: false, 
                time_taken: `${durationSeconds}s`,
                error: "API not found" 
            });
        }

    } catch (err) {
        const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        if (!responseSent) {
            res.status(500).json({ 
                success: false, 
                time_taken: `${durationSeconds}s`,
                error: err.message 
            });
        }
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => console.log(`Trace API running on port ${PORT}`));
