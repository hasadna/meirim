const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Log = require('../lib/log');

const GOV_IL_BASE = 'https://www.gov.il';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DELAY_BETWEEN_REQUESTS_MS = 2000;

const launchStealthBrowser = async () => {
	const browser = await puppeteer.launch({
		headless: true,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-blink-features=AutomationControlled',
			'--window-size=1920,1080',
		]
	});
	return browser;
};

const setupStealthPage = async (browser) => {
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(() => {
		Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
		window.chrome = { runtime: {} };
	});
	await page.setUserAgent(USER_AGENT);
	await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7' });
	return page;
};

/**
 * Downloads a file by triggering an anchor click on the page (so Chrome sends proper
 * navigation headers that Cloudflare accepts) and capturing the result via CDP
 * Browser.setDownloadBehavior before Chrome can show a download dialog.
 *
 * Why not fetch(): fetch() sends Sec-Fetch-Mode=cors which Cloudflare blocks (403).
 * Why not page.goto(): causes ERR_ABORTED (Chrome aborts navigation for binary files).
 * Anchor click sends Sec-Fetch-Mode=navigate which Cloudflare allows through.
 */
const downloadWithNavigation = async (page, url, file) => {
	const client = await page.createCDPSession();
	const downloadDir = os.tmpdir();

	await client.send('Browser.setDownloadBehavior', {
		behavior: 'allowAndName', // saves file as {guid} to avoid filename conflicts
		downloadPath: downloadDir,
		eventsEnabled: true
	});

	const downloadedPathPromise = new Promise((resolve, reject) => {
		// Fail fast if the download never begins (e.g. still 403)
		const startTimeout = setTimeout(
			() => reject(new Error(`Download did not begin within 20s for ${url} — server may have blocked the request`)),
			20000
		);
		let guid = null;

		client.on('Browser.downloadWillBegin', (event) => {
			clearTimeout(startTimeout);
			guid = event.guid;
			Log.info(`[download] began: guid=${guid}, file=${event.suggestedFilename}, url=${url}`);
		});

		client.on('Browser.downloadProgress', (event) => {
			if (guid && event.guid === guid) {
				Log.info(`[download] progress: ${event.receivedBytes}/${event.totalBytes} state=${event.state}`);
				if (event.state === 'completed') {
					resolve(path.join(downloadDir, event.guid));
				} else if (event.state === 'canceled') {
					reject(new Error(`Download was canceled for ${url}`));
				}
			}
		});
	});

	// Anchor click: Chrome sends Sec-Fetch-Mode=navigate (same as a user clicking a link).
	// Cloudflare allows this through. Browser.setDownloadBehavior intercepts the file
	// so the page stays at its current URL — no ERR_ABORTED, no navigation away.
	await page.evaluate((fileUrl) => {
		const a = document.createElement('a');
		a.href = fileUrl;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}, url);

	const downloadedPath = await Promise.race([
		downloadedPathPromise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(`Download timed out after 60s for ${url}`)), 60000))
	]);

	const content = fs.readFileSync(downloadedPath);
	fs.unlinkSync(downloadedPath); // cleanup temp file

	await new Promise((resolve, reject) => {
		file.write(content, (err) => { if (err) reject(err); else resolve(); });
	});
	await new Promise(resolve => file.close(resolve));
	await client.detach().catch(() => {});

	Log.info(`downloaded ${url} to ${file.path}`);
	return true;
};

/**
 * Creates a reusable download session for multiple files from the same domain.
 * Opens one browser, visits the base URL once to establish Cloudflare cookies,
 * then reuses that page for all subsequent downloads.
 *
 * @param {string} baseUrl - Homepage to visit first (establishes session/cookies)
 * @returns {{ download: Function, close: Function }}
 */
const createDownloadSession = async (baseUrl) => {
	const browser = await launchStealthBrowser();
	const page = await setupStealthPage(browser);

	Log.info(`createDownloadSession: establishing session on ${baseUrl}`);
	await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
	Log.info(`[session] session established. url=${page.url()}`);

	let lastRequestTime = Date.now();

	return {
		download: async (url, file) => {
			// Throttle requests to avoid rate limiting
			const elapsed = Date.now() - lastRequestTime;
			if (elapsed < DELAY_BETWEEN_REQUESTS_MS) {
				await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS - elapsed));
			}
			lastRequestTime = Date.now();
			return downloadWithNavigation(page, url, file);
		},
		close: async () => {
			await browser.close();
		}
	};
};

/**
 * Downloads a single file from a URL that may be protected by bot-detection.
 * For downloading multiple files from the same domain, prefer createDownloadSession().
 *
 * @param {string} url - The file URL to download
 * @param {fs.WriteStream} file - A writable stream to pipe the file into
 * @returns {Promise<boolean>} true on success, false on failure
 */
const downloadChallengedFile = async (url, file) => {
	let browser;
	try {
		Log.info(`downloadChallengedFile: launching browser for ${url}`);
		browser = await launchStealthBrowser();
		const page = await setupStealthPage(browser);

		if (url.startsWith(GOV_IL_BASE)) {
			await page.goto(GOV_IL_BASE, { waitUntil: 'networkidle2', timeout: 30000 });
		}

		return await downloadWithNavigation(page, url, file);
	} catch (err) {
		Log.error(`downloadChallengedFile error for ${url}: ${err.message}`);
		return false;
	} finally {
		if (browser) await browser.close();
	}
};


module.exports = {
	downloadChallengedFile,
	createDownloadSession,
	GOV_IL_BASE,
};
