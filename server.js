const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

let browser;

// Launch browser ONCE when server starts
(async () => {
    browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
            '--proxy-server="direct://"',
            '--proxy-bypass-list=*'
        ]
    });
    console.log("Browser warmed up and ready");
})();

app.get('/trace', async (req, res) => {
    const startTime = Date.now();
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No URL" });

    let page;
    try {
        page = await browser.newPage();
        
        // OPTIMIZATION: Block heavy assets & trackers
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const type = request.resourceType();
            const url = request.url();
            if (['image', 'stylesheet', 'font', 'media'].includes(type) || url.includes('google-analytics') || url.includes('doubleclick')) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // The instant result promise
        const capture = new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 15000); // 15s limit

            page.on('response', async (response) => {
                if (response.url().includes('fetch-video')) {
                    try {
                        const data = await response.json();
                        clearTimeout(timer);
                        resolve(data);
                    } catch (e) {}
                }
            });
        });

        // ULTRA-FAST GOTO: We don't wait for any "waitUntil" events
        page.goto(targetUrl).catch(() => {}); 

        // Immediate slight scroll to trigger lazy scripts
        setTimeout(() => {
            page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
        }, 500);

        const result = await capture;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (result) {
            res.json({ success: true, time_taken: `${duration}s`, data: result });
        } else {
            res.status(404).json({ success: false, time_taken: `${duration}s`, error: "Timeout" });
        }

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (page) await page.close(); // Only close the page, NOT the browser
    }
});

app.listen(PORT, () => console.log(`Nitro API on ${PORT}`));
