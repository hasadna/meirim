const Log = require('../log');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const fetch = require('node-fetch');
const moment = require('moment');
const AbortController = require('abort-controller');
const aws = require('aws-sdk');

const TreePermit = require('../../model/tree_permit');
const tpc = require('../../model/tree_permit_constants');
const database = require('../../service/database');
const Config = require('../../lib/config');
const Geocoder = require('../../service/tree_geocoder').geocoder;

// Regional tree permits were taken from here: 'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Pages/default.aspx';
const regionalTreePermitUrls = [
	//'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/Befor_galil_golan.XLS',
	// 'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_galil_golan.XLS',

	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/Befor_amakim_galil_gilboa.XLS',
	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_amakim_galil_gilboa.XLS',

	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/befor_merkaz-sharon.XLS',
	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_merkaz-sharon.XLS',

	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/Befor_merkaz_shfela.XLS',
	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_merkaz_shfela.XLS',

	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/Befor_jerusalem.XLS',
	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_jerusalem.XLS',

	'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/Befor_darom.XLS',
	//'https://www.moag.gov.il/yhidotmisrad/forest_commissioner/rishyonot_krita/Documents/after_darom.XLS', - no after darom
];

const SHEET_BEFORE = 'Data2ToExcel_BeforDate';
const SHEET_AFTER = 'Data2ToExcel_ToDate';
const TIMEOUT_MS = 5000;
const MORNING = '08:00';
const EVENING = '20:00';

const { treeBucketName: bucketName, useS3ForTreeFiles: useS3 } = Config.get('aws');
const treesRawDataDir = path.resolve(Config.get('trees.rawDataDir'));
const GEO_CODING_INTERVAL = Config.get('trees.geoCodingInterval');
const MAX_PERMITS = Config.get('trees.maxPermits');

async function getRegionalTreePermitsFromFile(url, pathname) {
	try {
		const controller = new AbortController();
		const controllerTimeout = setTimeout(
			() => { controller.abort(); },
			TIMEOUT_MS,
		);
		Log.info('Fetching trees file... ' + `${url}`);
		return new Promise((resolve, reject) => {
			(async () => {
				try {
					const res = await fetch(url, { signal: controller.signal });
					const stream = fs.createWriteStream(pathname);
					stream.on('open', () => {
						res.body.pipe(stream);
					});
					stream.on('finish', async function () {
						stream.close();
						Log.info(`Successfully Downloaded trees file: ${url}. File Could be found here: ${pathname}`);

						const treePermits = await parseTreesXLS(pathname);
						resolve(treePermits);
					});
				}
				catch (err) {
					Log.error(`Error fetching file ${url} :  ${err}`);
					reject(err);
				}
				finally {
					() => { clearTimeout(controllerTimeout); };
				}
			})();
		});
	}
	catch (err) {
		Log.error(err);
		return Promise.reject();
	}
}

async function saveNewTreePermits(treePermits, maxPermits) {
	// Tree permits are published for objecctions for a period of 2 weeks. taking a 12 months
	// buffer should be enough for human to remove those lines from the excel sheet.
	//We're reading a the rows as a bulk and match them at compute time for performance.

	if (treePermits.length == 0) return [];
	// all tree permits in a chunk should be from the same regional office
	const regionalOffice = treePermits[0].attributes[tpc.REGIONAL_OFFICE];
	// this is the only timestamp format knex correcrtly work with 
	const time_ago = moment().subtract(1, 'year').format('YYYY-MM-DDTHH:mm:ssZ');
	const existingPermitsCompact = new Set();
	await database.Knex(tpc.TREE_PERMIT_TABLE).where('updated_at', '>', time_ago.toString())
		.andWhere(tpc.REGIONAL_OFFICE, regionalOffice)
		.then(rows => {
			rows.map(row => {
				const key_as_string = `${row[tpc.REGIONAL_OFFICE]}_${row[tpc.PERMIT_NUMBER]}_${formatDate(row[tpc.START_DATE], MORNING)}`;
				existingPermitsCompact.add(key_as_string);
			});
		})
		.catch(function (error) { Log.error(error); });

	const newTreePermits = treePermits.map(tp => {
		//if tp is not in the hash map of the existing one - add to the new ones
		const compact_tp = `${tp.attributes[tpc.REGIONAL_OFFICE]}_${tp.attributes[tpc.PERMIT_NUMBER]}_${formatDate(tp.attributes[tpc.START_DATE], MORNING)}`;
		if (tp.attributes[tpc.REGIONAL_OFFICE] == regionalOffice && !existingPermitsCompact.has(compact_tp)) {
			Log.debug(`A new tree liecence! queued for saving ${compact_tp}`);
			return tp; //original one, not compact
		}
	}).filter(Boolean); // remove undefined values
	//save only the new ones
	try { //TODO promise all or knex save bulk
		const numPermits = (newTreePermits.length > maxPermits)? maxPermits : newTreePermits.length;
		const savedTreePermits = [];
		// Not using map / async on purpose, so node won't run this code snippet in parallel
		for (const tp of newTreePermits.slice(0,numPermits)){
			await new Promise(r => setTimeout(r, GEO_CODING_INTERVAL)); // max rate to query nominatim is 1 request per second
			const polygonFromPoint = await generateGeomFromAddress(tp.attributes[tpc.PLACE], tp.attributes[tpc.STREET]);
			tp.attributes[tpc.GEOM] = polygonFromPoint;
			Log.info(`Saving new tree permit: ${tp.attributes[tpc.REGIONAL_OFFICE]} ${tp.attributes[tpc.PERMIT_NUMBER]} with ${tp.attributes[tpc.TOTAL_TREES]} trees.`);
			await tp.save();
			savedTreePermits.push(tp);
		}	
		return savedTreePermits;
	}
	catch (err) {
		Log.error(err.message || err);
		return [];
	}
}

const parseTreesXLS = async (filename) => {
	// hack
	const sheetname = path.parse(filename).name.toLowerCase().includes('after') ? SHEET_AFTER : SHEET_BEFORE;
	const workbook = xlsx.readFile(filename);
	const sheet = workbook.Sheets[sheetname];
	const sheet_json = xlsx.utils.sheet_to_json(sheet, { raw: false });
	const rawTreePermits = sheet_json.map(row => {

		try {
			return {
				'core': {
					[tpc.REGIONAL_OFFICE]: row['אזור'],
					[tpc.PERMIT_NUMBER]: row['מספר רשיון'],
					[tpc.ACTION]: row['פעולה'], // cutting , copying
					[tpc.PERMIT_ISSUE_DATE]: formatDate(row['תאריך הרשיון'], MORNING),
					[tpc.PERSON_REQUEST_NAME]: row['מבקש'],
					[tpc.START_DATE]: formatDate(row['מתאריך'], MORNING),
					[tpc.END_DATE]: formatDate(row['עד תאריך'], EVENING),
					[tpc.LAST_DATE_TO_OBJECTION]: row['תאריך אחרון להגשת ערער'] ? formatDate(row['תאריך אחרון להגשת ערער'], MORNING) : undefined, // column might be missing from
					[tpc.APPROVER_NAME]: row['שם מאשר'],
					[tpc.APPROVER_TITLE]: row['תפיד מאשר'],
					// Location
					[tpc.PLACE]: row['מקום הפעולה'],
					[tpc.STREET]: row['רחוב'],
					[tpc.STREET_NUMBER]: row['מספר'],
					[tpc.GUSH]: row['גוש'],
					[tpc.HELKA]: row['חלקה'],

					[tpc.REASON_SHORT]: row['סיבה'],
					[tpc.REASON_DETAILED]: row['פרטי הסיבה'],
					[tpc.COMMENTS_IN_DOC]: row['הערות לעצים']	
				},
				'extra': {
					[tpc.TREE_NAME]: row['שם העץ'],
					[tpc.NUMBER_OF_TREES]: row['מספר עצים'],
				}
			};
		}
		catch (err) {
			Log.error(`Error reading line ${row['מספר רשיון']}-${row['שם העץ']} from file ${filename}`);
			Log.error(err);
		}
	});
	return processPermits(rawTreePermits);
};

async function getGeocode(place, street) {
	try {
		const address = (place && street) ?
			`${place} ${street}` : `${place}`;

		const res = await Geocoder.geocode(address);
		return res[0];
	}
	catch (err) {
		Log.error(err.message || err);
		return;
	}
}

async function generateGeomFromAddress(place, street) {
	
	let res = '';
	const address = `${place} ${street || ''}`;
	Log.debug(`address: ${address} `);

	if (!place) return;
	if (place && street) {
		res = await getGeocode(place, street);
		if (!res) { // try geocode place only
			Log.debug(`Couldn't geocode address: ${address}. try to fetch place from db.`);
			res = await fetchOrGeocodePlace(place);
			if (!res ) {
				Log.debug(`Failed to geocode address: ${place}`);
				return;
			}
		}
		Log.debug(`Managed to geocode address ${address} : ${res.longitude},${res.latitude} `);

	}
	else { // only place, no street
		res = await fetchOrGeocodePlace(place);
		if (!res ) {
			Log.debug(`Failed to geocode address: ${place}`);
			return;
		}
	} 
	const polygonFromPoint = JSON.parse(`{ "type": "Polygon", "coordinates": [[ [ ${res.longitude}, ${res.latitude}],[ ${res.longitude}, ${res.latitude}],[ ${res.longitude}, ${res.latitude}],[ ${res.longitude}, ${res.latitude}]  ]] }`);
	return polygonFromPoint;
}

async function fetchOrGeocodePlace(place) {
	//Since nominatim is very strict reagrding its usage policy, we first check if we have place's location in our db.
	const geomFromDB = await database.Knex.select(tpc.GEOM).from(tpc.TREE_PERMIT_TABLE).where({ [tpc.PLACE]: place }).limit(1);
	if (geomFromDB && geomFromDB[0] && geomFromDB[0].geom &&
		geomFromDB[0].geom[0] && geomFromDB[0].geom[0][0] &&
		geomFromDB[0].geom[0][0].x && geomFromDB[0].geom[0][0].y ) {
		const res = {
			longitude: geomFromDB[0].geom[0][0].x,
			latitude: geomFromDB[0].geom[0][0].y
		};
		Log.debug(`Found place coordinates in DB: ${res.longitude},${res.latitude} `);
		return res;
	}
	else {
		const res = await getGeocode(place);
		if (!res ) {
			Log.error(`Couldn't geocode address: ${place}.`);
			return;
		}
		Log.debug(`Managed to geocode place ${place} : ${res.longitude},${res.latitude} `);
		return res;
	}
}

function processPermits(rawTreePermits) {
	// Migrate all rows of each tree permit into one line: address, dates etc.
	// Add sum of all trees in the permit
	// Keep the details per tree kind / number of trees into a tree table
	const treePermits = {};
	rawTreePermits.map(rtp => {
		const key = `${rtp.core[tpc.REGIONAL_OFFICE]}_${rtp.core[tpc.PERMIT_NUMBER]}_${rtp.core[tpc.START_DATE]}}`;
		if (treePermits[key] && treePermits[key].attributes[tpc.TOTAL_TREES]) { //exist
			treePermits[key].attributes[tpc.TOTAL_TREES] = treePermits[key].attributes[tpc.TOTAL_TREES] + Number(rtp.extra[tpc.NUMBER_OF_TREES]);
			treePermits[key].attributes[tpc.TREES_PER_PERMIT] = { ...treePermits[key].attributes[tpc.TREES_PER_PERMIT], [rtp.extra[tpc.TREE_NAME]]: rtp.extra[tpc.NUMBER_OF_TREES] };
		}
		else { // a new one
			treePermits[key] = new TreePermit({ ...rtp.core, [tpc.TOTAL_TREES]: Number(rtp.extra[tpc.NUMBER_OF_TREES]) });
			treePermits[key].attributes[tpc.TREES_PER_PERMIT] = { [rtp.extra[tpc.TREE_NAME]]: rtp.extra[tpc.NUMBER_OF_TREES] };
		}
	});
	return Object.values(treePermits);
}

function formatDate(strDate, hour) {
	const isoDate = new Date(strDate).toISOString().split('T')[0]; //Date
	return `${isoDate}T${hour}`;
}

function generateFilenameByTime(url) {
	const parsedFile = path.parse(url);
	const filenameNoDate = parsedFile.base;
	const filenameWithDate = parsedFile.name.toLowerCase() + '-' + moment().format('YYYY-MM-DD-hh-mm-ss') + parsedFile.ext.toLowerCase();
	const localFilename = path.resolve(treesRawDataDir, filenameNoDate);
	return { s3filename: filenameWithDate, localFilename: localFilename };
}

async function crawlRegionalTreePermit(url, maxPermits) {
	try {
		const { s3filename, localFilename } = generateFilenameByTime(url);
		const treePermits = await getRegionalTreePermitsFromFile(url, localFilename);
		const newTreePermits = await saveNewTreePermits(treePermits, maxPermits);
		Log.info('Extracted ' + newTreePermits.length + ' new permits from: ' + s3filename);
		if (useS3) {
			await uploadToS3(s3filename, localFilename);
		}
		return newTreePermits.length;
	} catch (err) {
		Log.error(err);
		return false;
	}
}
const regionalTreePermit = async() => {
	let sumPermits = 0;
	let maxPermits = MAX_PERMITS;
	try {
		for (let i = 0; i < regionalTreePermitUrls.length && maxPermits > 0; i++) {
			const numSavedPermits =await crawlRegionalTreePermit(regionalTreePermitUrls[i], maxPermits);
			maxPermits = maxPermits - numSavedPermits;
			sumPermits = sumPermits + numSavedPermits;
		}
	}
	catch (err) {
		Log.error(err.message || err);
	}
	Log.info(`Done! Total ${sumPermits} new permits`);
	return sumPermits;
};

async function uploadToS3(filename, fullFileName) {
	const fileStream = fs.createReadStream(fullFileName);
	fileStream.on('error', function (err) {
		Log.error('File Error', err);
	});
	const keyName = 'regional/' + filename;
	const objectParams = { Bucket: bucketName, Key: keyName, Body: fileStream };
	const res = await new aws.S3({ apiVersion: '2006-03-01' }).putObject(objectParams).promise();
	Log.info(`Successfully Uploaded to ${bucketName}/${keyName}. Status code: ${res.$response.httpResponse.statusCode}`);
}

module.exports = {
	regionalTreePermit,
	generateGeomFromAddress
};
