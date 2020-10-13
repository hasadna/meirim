const expect = require('chai').expect;
const { mockDatabase } = require('../mock');
const { Plan } = require('../../api/model');
const { wait } = require('../utils');

describe('Plan model', function() {
	let instance;
	beforeEach(function () {
		instance = new Plan();
	}); 
	
	afterEach(function() {
		instance = null;
	});

	it('has the right rules', function() {
		const rules = instance.rules;
		expect(rules.sent).to.eql('integer');
		expect(rules.OBJECTID).to.eql(['required', 'integer']);
		expect(rules.rating).to.eql(['required', 'number']);
		expect(rules.PL_NUMBER).to.eql('string');
		expect(rules.jurisdiction).to.eql('string');
		expect(rules.areaChanges).to.eql('string');
		expect(rules.PL_NAME).to.eql('string');
		expect(rules.status).to.eql('string');
		expect(rules.plan_url).to.eql('string');
		expect(rules.tags).to.eql('array');
		expect(rules.data).to.eql([ 'required' ]);
		expect(rules.geom).to.eql([ 'required', 'object' ]);
		expect(rules.PLAN_COUNTY_NAME).to.eql('string');
	});

	it('has the right table name', function() {
		const tableName = instance.tableName;
		expect(tableName).to.eql('plan');
	});

	it('has the right defaults', function() {
		const defaults = instance.defaults();
		expect(defaults).to.eql({sent: 0});
	});

	it('has timestamps', function() {
		const isTimestamps = instance.hasTimestamps;
		expect(isTimestamps).to.eql(true);
	});

});

describe('Plan and Notification models integration', function() {
	this.timeout(6000);
	const tables = ['plan', 'notification'];
	beforeEach(async function() {
		await mockDatabase.dropTables(tables);
		await mockDatabase.createTables(tables);
	});

	afterEach(async function() {
		await mockDatabase.dropTables(tables);
	});

	it('Adds a row in notification table for new plan', async function() {
		const iPlan = {
			properties : 
				{
					OBJECTID: 4,
					PLAN_COUNTY_NAME: 'COUNTNAME',
					PL_NUMBER: 'plannumber',
					PL_NAME: 'planname',
					data: 'data',
					PL_URL: 'plurl',
					STATION_DESC: '50',
					tags: JSON.stringify(['tag1', 'tag2'])
				},
		};
		await Plan.buildFromIPlan(iPlan);
		await wait(1);
		const notifications = await mockDatabase.selectData('notification', {	plan_id: 1	});
		expect(notifications.length).to.eql(1);
		const [firstNotification] = notifications;
		expect(firstNotification.type).to.eql('NEW_PLAN_IN_AREA');
	});

	it('Adds a row in notification table for updated plan', async function() {
		const iPlan = {
			properties : 
				{
					OBJECTID: 4,
					PLAN_COUNTY_NAME: 'COUNTNAME',
					PL_NUMBER: 'plannumber',
					PL_NAME: 'planname',
					data: 'data',
					PL_URL: 'plurl',
					STATION_DESC: '50',
					tags: JSON.stringify(['tag1', 'tag2'] )
				},
		};
		await Plan.buildFromIPlan(iPlan);
		const plan = await Plan.forge({PL_NUMBER: iPlan.properties.PL_NUMBER}).fetch();

		const data = {
			OBJECTID: 1,
			PLAN_COUNTY_NAME: iPlan.properties.PLAN_COUNTY_NAME || '',
			PL_NUMBER: iPlan.properties.PL_NUMBER || '',
			PL_NAME: iPlan.properties.PL_NAME || '',
			tags: iPlan.properties.tags,
			data: iPlan.properties,
			geom: iPlan.geometry,
			PLAN_CHARACTOR_NAME: '',
			plan_url: iPlan.properties.PL_URL,
			status: '60',
		};
		await plan.set(data);
		await plan.save();
		await wait(1);
		const notifications = await mockDatabase.selectData('notification', {	plan_id: 1	});
		expect(notifications.length).to.eql(2);
		const [firstNotification, secondNotification] = notifications;
		expect(firstNotification.type).to.eql('NEW_PLAN_IN_AREA');
		expect(secondNotification.type).to.eql('STATUS_CHANGE');
	});

});