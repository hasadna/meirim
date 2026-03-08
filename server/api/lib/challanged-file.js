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
		protocolTimeout: 1200000, // 2 minutes — prevents Target.attachToTarget timeout on long runs
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
 * Downloads a file by triggering an anchor click (so Chrome sends Sec-Fetch-Mode=navigate
 * which Cloudflare accepts) and capturing the result via a pre-configured CDP client.
 *
 * @param {Page} page - Puppeteer page (already on the domain, session established)
 * @param {CDPSession} client - Reusable CDP session with Browser.setDownloadBehavior already set
 * @param {string} url - File URL to download
 * @param {fs.WriteStream} file - Writable stream for the output file
 */
const downloadWithNavigation = async (page, client, url, file) => {
	const downloadDir = os.tmpdir();

	const downloadedPathPromise = new Promise((resolve, reject) => {
		// Fail fast if the server blocks the request and no download begins
		const startTimeout = setTimeout(
			() => {
				client.off('Browser.downloadWillBegin', onBegin);
				client.off('Browser.downloadProgress', onProgress);
				reject(new Error(`Download did not begin within 20s for ${url} — server may have blocked the request`));
			},
			20000
		);

		let guid = null;

		const onBegin = (event) => {
			clearTimeout(startTimeout);
			guid = event.guid;
			Log.info(`[download] began: guid=${guid}, file=${event.suggestedFilename}`);
			client.off('Browser.downloadWillBegin', onBegin);
		};

		const onProgress = (event) => {
			if (!guid || event.guid !== guid) return;
			if (event.state === 'completed') {
				client.off('Browser.downloadProgress', onProgress);
				resolve(path.join(downloadDir, event.guid));
			} else if (event.state === 'canceled') {
				client.off('Browser.downloadProgress', onProgress);
				reject(new Error(`Download was canceled for ${url}`));
			}
		};

		client.on('Browser.downloadWillBegin', onBegin);
		client.on('Browser.downloadProgress', onProgress);
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
	fs.unlinkSync(downloadedPath);

	await new Promise((resolve, reject) => {
		file.write(content, (err) => { if (err) reject(err); else resolve(); });
	});
	await new Promise(resolve => file.close(resolve));

	Log.info(`downloaded ${url} to ${file.path}`);
	return true;
};

/**
 * Creates a reusable download session for multiple files from the same domain.
 * Opens one browser, visits the base URL once to establish Cloudflare cookies,
 * creates one CDP session for all downloads (avoids repeated Target.attachToTarget calls).
 *
 * @param {string} baseUrl - Homepage to visit first (establishes session/cookies)
 * @returns {{ download: Function, close: Function }}
 */
const createDownloadSession = async (baseUrl) => {
	const browser = await launchStealthBrowser();
	const page = await setupStealthPage(browser);

	Log.info(`createDownloadSession: establishing session on ${baseUrl}`);
	await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

	// Create CDP session once and reuse — avoids Target.attachToTarget timeout on long runs
	const client = await page.createCDPSession();
	await client.send('Browser.setDownloadBehavior', {
		behavior: 'allowAndName',
		downloadPath: os.tmpdir(),
		eventsEnabled: true
	});

	let lastRequestTime = Date.now();

	return {
		download: async (url, file) => {
			const elapsed = Date.now() - lastRequestTime;
			if (elapsed < DELAY_BETWEEN_REQUESTS_MS) {
				await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS - elapsed));
			}
			lastRequestTime = Date.now();
			return downloadWithNavigation(page, client, url, file);
		},
		close: async () => {
			await client.detach().catch(() => {});
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

		const client = await page.createCDPSession();
		await client.send('Browser.setDownloadBehavior', {
			behavior: 'allowAndName',
			downloadPath: os.tmpdir(),
			eventsEnabled: true
		});

		return await downloadWithNavigation(page, client, url, file);
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
