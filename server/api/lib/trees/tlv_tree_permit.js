const Config = require('../../lib/config');
const TreePermit = require('../../model/tree_permit');
const puppeteer = require('puppeteer');

const {
	REGIONAL_OFFICE, PERMIT_NUMBER, APPROVER_TITLE, ACTION,
	LAST_DATE_TO_OBJECTION, TOTAL_TREES,
	PLACE, STREET, START_DATE,
	TREES_PER_PERMIT, PERSON_REQUEST_NAME, TREE_PERMIT_URL,
	GUSH, HELKA, REASON_DETAILED, APPROVER_NAME
} = require('../../model/tree_permit_constants');
const { formatDate, figureStartDate } = require('./utils');
const Log = require('../log');

const STREET_NAME = 'שם הרחוב';
const OBJECTION_TILL = 'תאריך אחרון להגשת התנגדויות:';
const TREE_NUM = 'כמות העצים:';
const TREE_TYPE =  'מין העץ:';
const LICENSE_NUMBER = 'מספר רישיון';
const LICENSE_OWNER = 'שם בעל הרישיון';
const LICENSE_REASON = 'סיבה:';
const LICENSE_APPROVER_TITLE = 'פקיד יערות עירוני תל אביב-יפו';
const TEL_AVIV_CITY = 'תל אביב-יפו';
const SHORT_ACTION = 'כריתה';
const APPROVER = 'שם פקיד היערות המאשר:';
const HOUR_PERMIT = '09:00';
const DATE_FORMAT_PERMIT = 'DD/MM/YYYY';
const PERMIT_GUSH = 'גוש:';
const PERMIT_HELKA = 'חלקה:';

const TREES_TEL_AVIV_URL = Config.get('trees.tlvUrl');
const tlvTreePermit = {
	urls: [TREES_TEL_AVIV_URL]
};

async function parseTreesHtml(url) {
	const result = await scrapeTelAvivTreesRawRows(url);
	Log.info(`number of Tel Aviv permits: ${result.length}`);
	return result;
}

function processRawPermits(rawPermits) {
	try {
		const treePermits = rawPermits.map(raw => {
			try {
				const last_date_to_objection = formatDate(raw[OBJECTION_TILL], HOUR_PERMIT, DATE_FORMAT_PERMIT);
				if (!last_date_to_objection) {
					Log.error(`No / Bad dates format, ignore this license: tel aviv, ${raw[STREET_NAME]} , ${raw[OBJECTION_TILL]}`);
					return null;
				}

				const treesPerPermit = parseTreesPerPermit(raw[TREE_TYPE], raw[TREE_NUM]);
				const totalTrees = sum(treesPerPermit);

				const attributes = {
					[REGIONAL_OFFICE]: TEL_AVIV_CITY,
					[PLACE]: TEL_AVIV_CITY,
					[APPROVER_NAME]: raw[APPROVER],
					[APPROVER_TITLE]: LICENSE_APPROVER_TITLE,
					[PERMIT_NUMBER]: raw[LICENSE_NUMBER],
					[STREET]: raw[STREET_NAME],
					[GUSH]: raw[PERMIT_GUSH],
					[HELKA]: raw[PERMIT_HELKA],
					[ACTION]: SHORT_ACTION,
					[LAST_DATE_TO_OBJECTION]: last_date_to_objection,
					[START_DATE]: figureStartDate(null, raw[OBJECTION_TILL], HOUR_PERMIT, DATE_FORMAT_PERMIT, true),
					[PERSON_REQUEST_NAME]: raw[LICENSE_OWNER],
					[REASON_DETAILED]: raw[LICENSE_REASON],
					[TREES_PER_PERMIT]: treesPerPermit,
					[TOTAL_TREES]: totalTrees,
					[TREE_PERMIT_URL]: TREES_TEL_AVIV_URL,
				};
				const permit = new TreePermit(attributes);
				return permit;
			}
			catch (e) {
				Log.error(`error in Tel Aviv parse row, ignoring: ${raw[STREET_NAME]}`, e.message);
				return null;
			}
		}
		);
		return treePermits.filter(Boolean); // remove undefined values;
	}
	catch (e) {
		Log.error('error in hod hasharon parse rows:' + e);
	}
}

function parseTreesPerPermit(treesInPermitStr, treeAmount) {
	const linesName = getCleanLines(treesInPermitStr);
	const linesAmount = getCleanLines(treeAmount);
	var result = {};
	for (let i = 0; i < linesName.length; ++i) {
		result[i] = { [linesName[i]]: parseInt(linesAmount[i] || '0') };
	}
	return Object.assign({}, ...Object.values(result));
}

function getCleanLines(str) {
	str = replaceAll(str, '\t', '');
	str = replaceAll(str, '\n\n', '\n');
	return str.split('\n');
}

function replaceAll(str, from, to) {
	return str.replace(new RegExp(from, 'g'), to);
}

function sum(treeArray) {
	const amount = Object.values(treeArray).map(item => { return parseInt(item) || 0; });
	return amount.reduce((total, current) => {
		return total + current;
	});
}

/**
 * Scrape hod hasharon Tree page, and return the results as a TreePermit[].
 */
async function crawlTLVTrees(url, permitType) {
	try {
		const raw = await parseTreesHtml(TREES_TEL_AVIV_URL);
		const treePermits = processRawPermits(raw);
		return treePermits;
	}
	catch (e) {
		Log.error(e.message);
	}
}


async function scrapeTelAvivTreesRawRows(url) {
	let browser;
	try {
	  // Launch browser
	  Log.info('Launching browser...');
	  browser = await puppeteer.launch({ 
		headless: true,
		args: ['--no-sandbox']
	  });
	  
	  const page = await browser.newPage();
	   // Listen to console messages from the page
	//   page.on('console', msg => console.log('PAGE LOG:', msg.text()));
	  
	  // Navigate to the page
	  Log.info('Loading page...');
	  await page.goto(url, {
		waitUntil: 'networkidle2',
		timeout: 50000
	  });
	  
	  // Wait for tables to appear
	  Log.info('Waiting for content to load...');
	  await page.waitForSelector('table', { timeout: 10000 });
	  
	  // Additional wait using Promise
	  await new Promise(resolve => setTimeout(resolve, 3000));
	  
	  // Extract the table data
	  Log.info('Extracting and parsing data...');
	  const rows = await page.evaluate((LICENSE_NUMBER, STREET_NAME, ACTION, REASON_DETAILED, OBJECTION_TILL, TREE_NUM) => {
		try {
		const targetCaption = 'הודעות על אישור כריתה או העתקה של עצים';
		// Find the table with the caption
		const captions = Array.from(document.querySelectorAll('caption, h2, h3, h4, div, span'));
		let targetTable = null;
		
		for (const elem of captions) {
		  if (elem.textContent.includes(targetCaption)) {
			// Try to find the table (either parent or next sibling)
			targetTable = elem.closest('table') || elem.nextElementSibling;
			
			// If next sibling isn't a table, look further
			if (targetTable && targetTable.tagName !== 'TABLE') {
			  targetTable = elem.parentElement.querySelector('table');
			}
			
			if (targetTable && targetTable.tagName === 'TABLE') {
			  break;
			}
		  }
		}
		
		if (!targetTable) {
		  return { error: 'Table not found' };
		}
		// Extract all rows
		const rawRows = Array.from(targetTable.querySelectorAll('tr'));
		const result = [];
		
		// Parse rows in pairs
		for (let i = 1; i < rawRows.length; i = i + 2) {
		  const permit = {};
		  // Get permit number from title attribute
		  permit.permitNumber = rawRows[i].getAttribute('title') || '';
		  
		  // Parse first row (license number, street, action)
		  const cells = rawRows[i].querySelectorAll('td');
		  cells.forEach((elem, idx) => {
			const val = elem.textContent.trim();
			if (idx === 0) {
			  permit[LICENSE_NUMBER] = val;
			}
			if (idx === 1) {
			  permit[STREET_NAME] = val;
			}
			if (idx === 2) {
			  permit[ACTION] = val;

			}
			if (idx === 3) {
				permit[TREE_NUM] = val;
			}
			if (idx === 4) {
				permit[REASON_DETAILED] = val;
			  }
			  if (idx === 5) {
				permit[OBJECTION_TILL] = val;
			  }
		  });
		  
		  // Parse second row (additional details in nested divs)
		// Parse second row - let's debug the structure
       // Parse second row - additional details
	   if (i + 1 < rawRows.length) {
		const secondRow = rawRows[i + 1];
		const allH5s = secondRow.querySelectorAll('h5');
		
		allH5s.forEach((h5Elem) => {
		  const key = h5Elem.textContent.trim();
		  let valueElem = h5Elem.nextElementSibling;
		  if (!valueElem || valueElem.tagName !== 'SPAN') {
			valueElem = h5Elem.parentElement.querySelector('span');
		  }
		  if (!valueElem || valueElem.tagName !== 'SPAN') {
			valueElem = h5Elem.closest('div').querySelector('span');
		  }
		  
		  if (valueElem) {
			const value = valueElem.textContent.trim();
			permit[key] = value;
		  }
		});
	  }
		  result.push(permit);
		  
		}
		
		return result;
		}
		catch (error) {
			Log.error('Error:', error.message);
			return { error: error.message };
		}
	  } ,LICENSE_NUMBER, STREET_NAME, ACTION, REASON_DETAILED, OBJECTION_TILL, TREE_NUM); // Pass constants to the browser context);
	  
	  if (rows.error) {
		Log.error(rows.error);
	  } else {
		Log.info('Found', rows.length, 'rows');
		Log.info(JSON.stringify(rows, null, 2));
	  }
	  
	  return rows;
	  
	} catch (error) {
		Log.error(error.message);
	} finally {
	  if (browser) {
		await browser.close();
	  }
	}
  }

module.exports = { crawlTLVTrees, tlvTreePermit: tlvTreePermit };