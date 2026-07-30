const xlsx = require('xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');
const moment = require('moment');
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
	REASON_SHORT,
	REASON_DETAILED,
	TREE_PERMIT_URL,
	SHORT_REASONS
} = require('../../model/tree_permit_constants');

const { figureStartDate, formatDate } = require('./utils');

const YEELA_BASE_URL = 'https://yeela-trees.moag.gov.il';
const EXPORT_URL = `${YEELA_BASE_URL}/api/Fo/FOServiceRequest/exportRecordsToExcel`;
const YEELA_PERMIT_URL = `${YEELA_BASE_URL}/FoPublic/FoLicence`;
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
	[PERMIT_NUMBER]: 'מספר רישיון',
	[PERMIT_ISSUE_DATE]: 'מועד פרסום רישיון',
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
					[REASON_SHORT]: 'בנייה ופיתוח',
					[TREE_PERMIT_URL] : YEELA_PERMIT_URL
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


const parseRequestReason = (requestReason) => {
	if (!requestReason) return { short: null, detailed: null };
	const matched = SHORT_REASONS.find(r => requestReason.startsWith(r));
	if (!matched) return { short: null, detailed: requestReason.trim() };
	const rest = requestReason.slice(matched.length).replace(/^\s*-\s*/, '').trim();
	return { short: matched, detailed: rest || null };
};

const isoToPermitDate = (isoStr, hour) => {
	if (!isoStr) return null;
	const isoDate = moment(isoStr).format('YYYY-MM-DD');
	return `${isoDate}T${hour}`;
};

const fetchAllYeelaPermitsFromApi = async (page) => {
	const allResults = [];
	let pageNumber = 1;
	const pageSize = 100;

	while (true) {
		const data = await page.evaluate(async (pageNumber, pageSize) => {
			const r = await fetch('/api/Fo/FOServiceRequest/getFOGridPublicityLicenses', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					orderDetails: null,
					pageDetails: { pageNumber, pageSize },
					parameters: { zoneId: null, cityId: null, appealLastDate: null, licenseId: null, licenseStatusId: 3 },
				}),
			});
			return r.json();
		}, pageNumber, pageSize);

		if (!data.result || data.result.length === 0) break;
		allResults.push(...data.result);
		Log.info(`Yeela API: fetched page ${pageNumber}/${data.pagination.totalPages} (${allResults.length}/${data.pagination.totalCount} rows)`);
		if (pageNumber >= data.pagination.totalPages) break;
		pageNumber++;
	}

	return allResults;
};

const buildPermitsFromApiRows = (rows) => {
	const grouped = {};
	for (const row of rows) {
		const licenseId = String(row.licenseId);
		const treeName = row.treeName || 'לא צוין סוג העץ';
		const cutting = Number(row.unproot) || 0;
		const transplanting = Number(row.copying) || 0;
		const conservation = Number(row.conservation) || 0;

		if (!grouped[licenseId]) {
			const detail = (row.expandRows || [])[0] || {};
			const approverRaw = detail.approvedBy || '';
			const approverParts = approverRaw.split(' - ');
			const approverTitle = approverParts[0] || null;
			const approverName = approverParts[1] || null;

			const issueDate = detail.dateOLicensePublic || row.approvedDate;
			const startDate = detail.dateOfIssue
				? isoToPermitDate(detail.dateOfIssue, MORNING)
				: figureStartDate(issueDate, row.appealLastDate, MORNING, moment.ISO_8601, false);
			const { short: reasonShort, detailed: reasonDetailed } = parseRequestReason(detail.requestReason);

			grouped[licenseId] = {
				core: {
					[REGIONAL_OFFICE]: row.zoneName || null,
					[PERMIT_NUMBER]: licenseId,
					[PERMIT_ISSUE_DATE]: isoToPermitDate(issueDate, MORNING),
					[START_DATE]: startDate,
					[END_DATE]: isoToPermitDate(detail.licenseValidUntil, EVENING),
					[LAST_DATE_TO_OBJECTION]: isoToPermitDate(row.appealLastDate, EVENING),
					[PLACE]: row.cityName || null,
					[STREET]: detail.street || null,
					[GUSH]: detail.block ? String(detail.block) : null,
					[HELKA]: detail.parcel ? String(detail.parcel) : null,
					[PERSON_REQUEST_NAME]: detail.customerName ? detail.customerName.trim() : null,
					[APPROVER_TITLE]: approverTitle,
					[APPROVER_NAME]: approverName,
					[REASON_SHORT]: reasonShort,
					[REASON_DETAILED]: reasonDetailed,
					[TREE_PERMIT_URL]: YEELA_PERMIT_URL,
				},
				treesPerPermit: {},
				totalTrees: 0,
				hasAnyTransplanting: false,
				hasAnyCutting: false,
			};
		}

		const entry = grouped[licenseId];
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

const crawlYeelaTreePermitViaApi = async (_url) => {
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

		Log.info('Yeela: fetching permits from JSON API');
		const rows = await fetchAllYeelaPermitsFromApi(page);
		Log.info(`Yeela: fetched ${rows.length} total tree rows, building permits`);

		return buildPermitsFromApiRows(rows);
	} finally {
		if (browser) await browser.close();
	}
};

const crawlYeelaTreePermit = async (_url, permitType) => {
	return crawlYeelaTreePermitViaApi(_url);
};

exports.crawlYeelaTreePermit = crawlYeelaTreePermit;
exports.buildPermitsFromRows = buildPermitsFromRows;
