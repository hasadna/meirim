const expect = require('chai').expect;
const sinon = require('sinon');

const {
	REGIONAL_OFFICE,
	PERMIT_NUMBER,
	START_DATE,
	PLACE,
	ACTION,
	APPROVER_NAME,
	APPROVER_TITLE,
	TOTAL_TREES,
	TREES_PER_PERMIT,
} = require('../../api/model/tree_permit_constants');

// buildPermitsFromRows is pure logic — no Puppeteer involved
const { buildPermitsFromRows, YeelaTreePermit } = require('../../api/lib/trees/yeela_tree_permit');

// 4 raw rows: 2 permits × 2 species each
// Permit A: ישוב is null → falls back to אזור; START_DATE is null → derived
// Permit B: ישוב provided; START_DATE provided directly

const fixtureRows = [
	{
		'מספר רשיון': 'A-001',
		'מועד פרסום רשיון': '01/03/2024',
		'תוקף רישיון מ-': null,
		'תוקף רישיון עד': null,
		'אזור': 'ירושלים',
		'ישוב': null,
		'תאריך אחרון להגשת השגה': '15/03/2024',
		'מין העץ': 'אורן ירושלים',
		'סה\'כ לכריתה': '3',
		'סה\'כ להעתקה': '0',
		'סה\'כ לשימור': '1',
		'מבקש': 'ישראל ישראלי',
		'רחוב ומספר בית': 'הרצל 5',
		'גוש': '30001',
		'חלקה': '55',
		'תפקיד ושם המאשר': 'מנהל - רחמים כהן',
	},
	{
		'מספר רשיון': 'A-001',
		'מועד פרסום רשיון': '01/03/2024',
		'תוקף רישיון מ-': null,
		'תוקף רישיון עד': null,
		'אזור': 'ירושלים',
		'ישוב': null,
		'תאריך אחרון להגשת השגה': '15/03/2024',
		'מין העץ': 'זית',
		'סה\'כ לכריתה': '0',
		'סה\'כ להעתקה': '2',
		'סה\'כ לשימור': '0',
		'מבקש': 'ישראל ישראלי',
		'רחוב ומספר בית': 'הרצל 5',
		'גוש': '30001',
		'חלקה': '55',
		'תפקיד ושם המאשר': 'מנהל - רחמים כהן',
	},
	{
		'מספר רשיון': 'B-002',
		'מועד פרסום רשיון': '05/03/2024',
		'תוקף רישיון מ-': '20/03/2024',
		'תוקף רישיון עד': '20/04/2024',
		'אזור': 'תל אביב',
		'ישוב': 'תל אביב-יפו',
		'תאריך אחרון להגשת השגה': '19/03/2024',
		'מין העץ': 'פיקוס',
		'סה\'כ לכריתה': '5',
		'סה\'כ להעתקה': '0',
		'סה\'כ לשימור': '0',
		'מבקש': 'דנה לוי',
		'רחוב ומספר בית': 'דיזנגוף 10',
		'גוש': '6660',
		'חלקה': '12',
		'תפקיד ושם המאשר': 'סגן מנהל - שירה גולן',
	},
	{
		'מספר רשיון': 'B-002',
		'מועד פרסום רשיון': '05/03/2024',
		'תוקף רישיון מ-': '20/03/2024',
		'תוקף רישיון עד': '20/04/2024',
		'אזור': 'תל אביב',
		'ישוב': 'תל אביב-יפו',
		'תאריך אחרון להגשת השגה': '19/03/2024',
		'מין העץ': 'ברוש',
		'סה\'כ לכריתה': '0',
		'סה\'כ להעתקה': '3',
		'סה\'כ לשימור': '2',
		'מבקש': 'דנה לוי',
		'רחוב ומספר בית': 'דיזנגוף 10',
		'גוש': '6660',
		'חלקה': '12',
		'תפקיד ושם המאשר': 'סגן מנהל - שירה גולן',
	},
];

describe('Yeela tree permit crawler', function () {

	let results;

	before(function () {
		results = buildPermitsFromRows(fixtureRows, YeelaTreePermit);
	});

	it('produces exactly 2 permit records from 4 rows', function () {
		expect(results).to.have.lengthOf(2);
	});

	describe('Permit A-001', function () {
		let permit;
		before(function () {
			permit = results.find(r => r.attributes[PERMIT_NUMBER] === 'A-001');
		});

		it('exists', function () {
			expect(permit).to.not.be.undefined;
		});

		it('TREES_PER_PERMIT aggregates both species correctly', function () {
			const tpp = permit.attributes[TREES_PER_PERMIT];
			expect(tpp).to.have.property('אורן ירושלים');
			expect(tpp['אורן ירושלים'].cutting).to.equal(3);
			expect(tpp['אורן ירושלים'].conservation).to.equal(1);
			expect(tpp).to.have.property('זית');
			expect(tpp['זית'].transplanting).to.equal(2);
		});

		it('TOTAL_TREES sums all species counts', function () {
			// 3 cutting + 1 conservation + 2 transplanting = 6
			expect(permit.attributes[TOTAL_TREES]).to.equal(6);
		});

		it('PLACE falls back to אזור when ישוב is null', function () {
			expect(permit.attributes[PLACE]).to.equal('ירושלים');
		});

		it('REGIONAL_OFFICE is set from אזור', function () {
			expect(permit.attributes[REGIONAL_OFFICE]).to.equal('ירושלים');
		});

		it('START_DATE is derived via figureStartDate when null in source', function () {
			expect(permit.attributes[START_DATE]).to.be.a('string');
			expect(permit.attributes[START_DATE]).to.match(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('ACTION is כריתה when any species has cutting > 0', function () {
			expect(permit.attributes[ACTION]).to.equal('כריתה');
		});

		it('APPROVER_TITLE and APPROVER_NAME are split on " - "', function () {
			expect(permit.attributes[APPROVER_TITLE]).to.equal('מנהל');
			expect(permit.attributes[APPROVER_NAME]).to.equal('רחמים כהן');
		});
	});

	describe('Permit B-002', function () {
		let permit;
		before(function () {
			permit = results.find(r => r.attributes[PERMIT_NUMBER] === 'B-002');
		});

		it('exists', function () {
			expect(permit).to.not.be.undefined;
		});

		it('PLACE uses ישוב when it is provided', function () {
			expect(permit.attributes[PLACE]).to.equal('תל אביב-יפו');
		});

		it('START_DATE is parsed from the column value', function () {
			expect(permit.attributes[START_DATE]).to.be.a('string');
			expect(permit.attributes[START_DATE]).to.include('2024-03-20');
		});

		it('TREES_PER_PERMIT aggregates פיקוס and ברוש', function () {
			const tpp = permit.attributes[TREES_PER_PERMIT];
			expect(tpp['פיקוס'].cutting).to.equal(5);
			expect(tpp['ברוש'].transplanting).to.equal(3);
			expect(tpp['ברוש'].conservation).to.equal(2);
		});

		it('TOTAL_TREES is 10', function () {
			// 5 cutting + 3 transplanting + 2 conservation = 10
			expect(permit.attributes[TOTAL_TREES]).to.equal(10);
		});

		it('ACTION is כריתה when cutting is present alongside transplanting', function () {
			expect(permit.attributes[ACTION]).to.equal('כריתה');
		});

		it('APPROVER_TITLE and APPROVER_NAME are split correctly', function () {
			expect(permit.attributes[APPROVER_TITLE]).to.equal('סגן מנהל');
			expect(permit.attributes[APPROVER_NAME]).to.equal('שירה גולן');
		});
	});
});
