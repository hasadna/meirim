const moment = require('moment');
const Controller = require('../controller/controller');
const TreePermit = require('../model/tree_permit');
const tpc = require('../model/tree_permit_constants');
const { Knex } = require('../service/database');

class TreePermitController extends Controller {
	browse (req) {

		const { query } = req;

		const columns = [
			'id',
			tpc.PLACE,
			tpc.STREET,
			tpc.STREET_NUMBER,
			tpc.REASON_SHORT,
			tpc.REASON_DETAILED,
			tpc.PERSON_REQUEST_NAME,
			tpc.APPROVER_NAME,
			tpc.APPROVER_TITLE,
			tpc.PERMIT_ISSUE_DATE,
			tpc.PERMIT_NUMBER,
			tpc.REGIONAL_OFFICE,
			tpc.START_DATE,
			tpc.TOTAL_TREES,
			tpc.TREES_PER_PERMIT,
			tpc.ACTION,
			tpc.GEOM,
			tpc.GUSH,
			tpc.HELKA,
			tpc.LAST_DATE_TO_OBJECTION,
		];

		const where = {};
		// First order by days to permit start date for permits that are still applyable for public objection, then all the rest
		const orderByRaw = [Knex.raw('case when datediff(current_date(), tree_permit.last_date_to_objection) > -1 then datediff(current_date(), tree_permit.last_date_to_objection) else -1 end asc, last_date_to_objection asc, id ')];

		if (query.PLACE) {
			where.PLACE = query.PLACE.split(',');
		}
		const whereNotIn = { [tpc.PLACE] : tpc.UNSUPPORTED_PLACES };
		return super.browse(req, {
			columns,
			where,
			whereNotIn,
			orderByRaw,
		});
	}

	async geojson (req) {
		const columns = [
			'id',
			tpc.PLACE,
			tpc.STREET,
			tpc.STREET_NUMBER,
			tpc.REASON_SHORT,
			tpc.REASON_DETAILED,
			tpc.PERSON_REQUEST_NAME,
			tpc.APPROVER_NAME,
			tpc.APPROVER_TITLE,
			tpc.PERMIT_ISSUE_DATE,
			tpc.PERMIT_NUMBER,
			tpc.REGIONAL_OFFICE,
			tpc.START_DATE,
			tpc.TOTAL_TREES,
			tpc.TREES_PER_PERMIT,
			tpc.ACTION,
			tpc.GEOM,
			tpc.GUSH,
			tpc.HELKA,
			tpc.LAST_DATE_TO_OBJECTION,
		];

		const response = await super.browse(req, {
			columns,
			whereRaw: [Knex.raw('DATE_SUB(current_date(), INTERVAL 14 DAY) < last_date_to_objection')],
			pageSize: 10000000,
		});
		const now = moment();
		return {
			type: 'FeatureCollection',
			features: response.map(item => {
				const geom = item.attributes.geom;

				if (!geom) {
					return null;
				}

				const is_active = moment(item.attributes.last_date_to_objection).isAfter(now);
				return {
					'type': 'Feature',
					'properties': { ...item.attributes, geom: null, is_active },
					'id': item.attributes.id,
					'geometry': geom
				};
			}).filter(Boolean)
		};
	}
	place() {
		return Knex.raw(
			`SELECT ${tpc.PLACE}, COUNT(*) as num FROM ${tpc.TREE_PERMIT_TABLE} WHERE ${tpc.PLACE} NOT IN (${tpc.UNSUPPORTED_PLACES.map(p => `'${p}'`).join(',')}) GROUP BY ${tpc.PLACE}`
		).then(results => results[0]);
	}

}

module.exports = new TreePermitController(TreePermit);