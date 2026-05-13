const xlsx = require('xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Log = require('../log');
const Config = require('../../lib/config');
const TreePermit = require('../../model/tree_permit');

const {
	REGIONAL_OFFICE,
	PERMIT_NUMBER,
	PERMIT_ISSUE_DATE,
	START_DATE,
	END_DATE,
	LAST_DATE_TO_OBJECTION,
	PLACE,
	STREET,
	GUSH,
	HELKA,
	ACTION,
	PERSON_REQUEST_NAME,
	APPROVER_NAME,
	APPROVER_TITLE,
	TREE_NAME,
	TOTAL_TREES,
	TREES_PER_PERMIT,
} = require('../../model/tree_permit_constants');

const { figureStartDate, formatDate } = require('./utils');

const YEELA_BASE_URL = 'https://yeela-trees.moag.gov.il';
const EXPORT_URL = `${YEELA_BASE_URL}/api/Fo/FOServiceRequest/exportRecordsToExcel`;
const EXPORT_BODY = {
	orderDetails: null,
	parameters: {
		zoneId: null,
		cityId: null,
		appealLastDate: null,
		licenseId: null,
		licenseStatusId: 3, // מושהה ופתוח להגשת השגה
	},
};

const MORNING = '08:00';
const EVENING = '20:00';
const SHEET_NAME = 'פרסום רישיונות כריתה והעתקה';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

exports.YeelaTreePermit = {
	[REGIONAL_OFFICE]: null,
	[PERMIT_NUMBER]: 'מספר רשיון',
	[PERMIT_ISSUE_DATE]: 'מועד פרסום רשיון',
	[START_DATE]: 'תוקף רישיון מ-',
	[END_DATE]: 'תוקף רישיון עד',
	[LAST_DATE_TO_OBJECTION]: 'תאריך אחרון להגשת השגה',
	[PLACE]: 'ישוב',
	[STREET]: 'רחוב ומספר בית',
	[GUSH]: 'גוש',
	[HELKA]: 'חלקה',
	[ACTION]: null,
	[PERSON_REQUEST_NAME]: 'מבקש',
	[APPROVER_NAME]: 'תפקיד ושם המאשר',
	[APPROVER_TITLE]: 'תפקיד ושם המאשר',
	[TREE_NAME]: 'מין העץ',

	dateFormat: 'DD/MM/YYYY',
	urls: [Config.get('trees.yeelaUrl')],
};

const launchStealthBrowser = async () => {
	const puppeteer = require('puppeteer');
	const args = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-blink-features=AutomationControlled',
		'--window-size=1920,1080',
	];
	const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
	if (proxy) {
		Log.info(`using proxy ${proxy}`);
		args.push(`--proxy-server=${proxy}`);
	}
	const browser = await puppeteer.launch({
		headless: true,
		protocolTimeout: 1200000,
		args: args,
	});
	return browser;
};

const downloadYeelaXlsx = async () => {
	let browser;
	try {
		browser = await launchStealthBrowser();
		const page = await browser.newPage();
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
			window.chrome = { runtime: {} };
		});
		await page.setUserAgent(USER_AGENT);
		await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7' });

		Log.info('Yeela: establishing session on ' + Config.get('trees.yeelaUrl'));
		await page.goto(Config.get('trees.yeelaUrl'), { waitUntil: 'networkidle2' });

		Log.info('Yeela: downloading XLSX via POST');
		const arrayBuffer = await page.evaluate(async (url, body) => {
			const resp = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'userorgroleid': '' },
				body: JSON.stringify(body),
			});
			console.log('Yeela export HTTP status: ' + resp.status);
			if (!resp.ok) throw new Error('HTTP ' + resp.status);
			const buf = await resp.arrayBuffer();
			return Array.from(new Uint8Array(buf));
		}, EXPORT_URL, EXPORT_BODY);

		const tmpFile = path.join(os.tmpdir(), `yeela_tree_permit_${Date.now()}.xlsx`);
		fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));
		Log.info('Yeela: XLSX saved to ' + tmpFile);
		return tmpFile;
	} finally {
		if (browser) await browser.close();
	}
};

const buildPermitsFromRows = (rows, permitType) => {
	const grouped = {};

	for (const row of rows) {
		const permitNumber = row[permitType[PERMIT_NUMBER]];
		if (!permitNumber) continue;

		const key = permitNumber;

		const treeName = row[permitType[TREE_NAME]] || 'לא צוין סוג העץ';
		const cutting = Number(row['סה\'כ לכריתה']) || 0;
		const transplanting = Number(row['סה\'כ להעתקה']) || 0;
		const conservation = Number(row['סה\'כ לשימור']) || 0;

		if (!grouped[key]) {
			const rawPlace = row[permitType[PLACE]];
			const rawZone = row['אזור'];
			const place = rawPlace || rawZone || 'אחר';

			const rawStartDate = row[permitType[START_DATE]];
			const rawIssueDate = row[permitType[PERMIT_ISSUE_DATE]];
			const rawLastDate = row[permitType[LAST_DATE_TO_OBJECTION]];

			const startDateFormatted = rawStartDate
				? formatDate(rawStartDate, MORNING, permitType.dateFormat)
				: figureStartDate(rawIssueDate, rawLastDate, MORNING, permitType.dateFormat, false);

			const approverRaw = row[permitType[APPROVER_NAME]] || '';
			const approverParts = approverRaw.split(' - ');
			const approverTitle = approverParts[0] || null;
			const approverName = approverParts[1] || null;

			grouped[key] = {
				core: {
					[REGIONAL_OFFICE]: rawZone || null,
					[PERMIT_NUMBER]: String(permitNumber),
					[PERMIT_ISSUE_DATE]: rawIssueDate ? formatDate(rawIssueDate, MORNING, permitType.dateFormat) : null,
					[START_DATE]: startDateFormatted,
					[END_DATE]: row[permitType[END_DATE]] ? formatDate(row[permitType[END_DATE]], EVENING, permitType.dateFormat) : null,
					[LAST_DATE_TO_OBJECTION]: rawLastDate ? formatDate(rawLastDate, EVENING, permitType.dateFormat) : null,
					[PLACE]: place,
					[STREET]: row[permitType[STREET]] || null,
					[GUSH]: row[permitType[GUSH]] ? String(row[permitType[GUSH]]) : null,
					[HELKA]: row[permitType[HELKA]] ? String(row[permitType[HELKA]]) : null,
					[PERSON_REQUEST_NAME]: row[permitType[PERSON_REQUEST_NAME]] || null,
					[APPROVER_TITLE]: approverTitle,
					[APPROVER_NAME]: approverName,
				},
				treesPerPermit: {},
				totalTrees: 0,
				hasAnyTransplanting: false,
				hasAnyCutting: false,
			};
		}

		const entry = grouped[key];
		if (cutting > 0) {
			if (!entry.treesPerPermit['כריתה']) entry.treesPerPermit['כריתה'] = {};
			entry.treesPerPermit['כריתה'][treeName] = (entry.treesPerPermit['כריתה'][treeName] || 0) + cutting;
			entry.hasAnyCutting = true;
		}
		if (transplanting > 0) {
			if (!entry.treesPerPermit['העתקה']) entry.treesPerPermit['העתקה'] = {};
			entry.treesPerPermit['העתקה'][treeName] = (entry.treesPerPermit['העתקה'][treeName] || 0) + transplanting;
			entry.hasAnyTransplanting = true;
		}
		if (conservation > 0) {
			if (!entry.treesPerPermit['שימור']) entry.treesPerPermit['שימור'] = {};
			entry.treesPerPermit['שימור'][treeName] = (entry.treesPerPermit['שימור'][treeName] || 0) + conservation;
		}
		entry.totalTrees += cutting + transplanting;
	}

	return Object.values(grouped).map(entry => {
		const action = entry.hasAnyCutting ? 'כריתה' : (entry.hasAnyTransplanting ? 'העתקה' : null);
		const tp = new TreePermit({
			...entry.core,
			[ACTION]: action,
			[TOTAL_TREES]: entry.totalTrees,
		});
		tp.attributes[TREES_PER_PERMIT] = entry.treesPerPermit;
		return tp;
	});
};

const crawlYeelaTreePermit = async (_url, permitType) => {
	const tmpFile = await downloadYeelaXlsx();
	try {
		const workbook = xlsx.readFile(tmpFile);
		const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
		const rows = xlsx.utils.sheet_to_json(sheet, { raw: false });
		return buildPermitsFromRows(rows, permitType);
	} finally {
		try { fs.unlinkSync(tmpFile); } catch (_) {}
	}
};

exports.crawlYeelaTreePermit = crawlYeelaTreePermit;
exports.buildPermitsFromRows = buildPermitsFromRows;
