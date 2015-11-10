'use strict';

var platform = require('./platform'),
	pg = require('pg').Client,
	moment = require('moment'),
	isJSON = require('is-json'),
	_      = require('lodash'),
	parseFields, tableName, client;


/*
 * Listen for the data event.
 */
platform.on('data', function (data) {

	var columnList,
		valueList,
		first = true;

	_.forEach(parseFields, function(field, key) {

		var datum = data[field.source_field],
			processedDatum;

		if (datum !== undefined && datum !== null) {
			if (field.data_type) {
				try {
					if (field.data_type === 'String') {

						if (isJSON(datum))
							processedDatum = '\'' + JSON.stringify(datum) + '\'';
						else
							processedDatum = '\'' + String(datum) + '\'';


					} else if (field.data_type === 'Integer')  {

						var intData = parseInt(datum);

						if (isNaN(intData))
							processedDatum = datum; //store original value
						else
							processedDatum = intData;

					} else if (field.data_type === 'Float')  {

						var floatData = parseFloat(datum);

						if (isNaN(floatData))
							processedDatum = datum; //store original value
						else
							processedDatum = floatData;

					} else if (field.data_type === 'Boolean') {

						var type = typeof datum;

						if ((type === 'string' && datum.toLocaleLowerCase() === 'true') ||
							(type === 'boolean' && datum === true )) {
							processedDatum = 1;
						} else if ((type === 'string' && datum.toLocaleLowerCase() === 'false') ||
							(type === 'boolean' && datum === false )) {
							processedDatum = 0;
						} else {
							processedDatum = datum;
						}
					} else if (field.data_type === 'DateTime') {

						var dtm = new Date(datum);
						if (!isNaN( dtm.getTime())) {

							if (field.format !== undefined)
								processedDatum = '\'' + moment(dtm).format(field.format) + '\'';
							else
								processedDatum = '\'' + dtm + '\'';


						} else {
							processedDatum = '\'' + datum + '\'';
						}
					}
				} catch (e) {
					if (typeof datum === 'number')
						processedDatum = datum;
					else if (isJSON(datum))
						processedDatum = JSON.stringify(datum);
					else
						processedDatum = '\'' + datum + '\'';
				}

			} else {
				if (typeof datum === 'number')
					processedDatum = datum;
				else if (isJSON(datum))
					processedDatum = '\'' + JSON.stringify(datum) + '\'';
				else
					processedDatum = '\'' + datum + '\'';
			}

		} else {
			processedDatum = null;
		}

		if (!first) {
			valueList  = valueList  + ',' + processedDatum;
			columnList = columnList  + ',' + key;
		} else {
			first      = false;
			valueList  = processedDatum;
			columnList = key;
		}

	});

	client.query('insert into ' + tableName + ' (' + columnList + ') values (' + valueList + ')', function(reqErr, queryset) {

		if (reqErr) {
			console.error('Error creating record on PostgreSQL', reqErr);
			platform.handleException(reqErr);
		} else {
			platform.log(JSON.stringify({
				title: 'Record Successfully inserted to PostgreSQL.',
				data: valueList
			}));
		}

	});
});

/*
 * Event to listen to in order to gracefully release all resources bound to this service.
 */
platform.on('close', function () {
	var domain = require('domain');
	var d = domain.create();

	d.on('error', function(error) {
		console.error(error);
		platform.handleException(error);
		platform.notifyClose();
	});

	d.run(function() {
		// TODO: Release all resources and close connections etc.
		client.end();
		platform.notifyClose(); // Notify the platform that resources have been released.
	});
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options) {

	try {
		parseFields = JSON.parse(options.fields);

		_.forEach(parseFields, function(field, key) {
			if (field.source_field === undefined || field.source_field === null) {
				throw( new Error('Source field is missing for ' + key + ' in PostgreSQL Plugin'));
			} else if (field.data_type  && (field.data_type !== 'String' && field.data_type !== 'Integer' &&
				field.data_type !== 'Float'  && field.data_type !== 'Boolean' &&
				field.data_type !== 'DateTime')) {
				throw(new Error('Invalid Data Type for ' + key + ' allowed data types are (String, Integer, Float, Boolean, DateTime) in PostgreSQL Plugin'));
			}
		});

	} catch (e) {
		console.error('Error parsing JSON field configuration for PostgreSQL.', e);
		platform.handleException(e);
		return;
	}

	var connection = 'postgres://' + options.user + ':' + options.password + '@' + options.host + '/' + options.database;

	client = new pg(connection);

	tableName = options.table;

	client.connect(function (err) {
		if (err) {
			console.error('Error connecting in PostgreSQL.', err);
			platform.handleException(err);
		} else {
			platform.log('Connected to PostgreSQL.');
			platform.notifyReady();
		}
	});

});