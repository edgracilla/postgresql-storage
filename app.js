'use strict';

var async         = require('async'),
	moment        = require('moment'),
	platform      = require('./platform'),
	isPlainObject = require('lodash.isplainobject'),
	parseFields, tableName, client;

/*
 * Listen for the data event.
 */
platform.on('data', function (data) {
	var columnList,
		valueList,
		first = true;

	async.forEachOf(parseFields, function (field, key, callback) {

		var datum = data[field.source_field],
			processedDatum;

		if (datum !== undefined && datum !== null) {
			if (field.data_type) {
				try {
					if (field.data_type === 'String') {
						if (isPlainObject(datum))
							processedDatum = '\'' + JSON.stringify(datum) + '\'';
						else
							processedDatum = '\'' + datum + '\'';
					} else if (field.data_type === 'Integer') {

						var intData = parseInt(datum);

						if (isNaN(intData))
							processedDatum = datum; //store original value
						else
							processedDatum = intData;

					} else if (field.data_type === 'Float') {

						var floatData = parseFloat(datum);

						if (isNaN(floatData))
							processedDatum = datum; //store original value
						else
							processedDatum = floatData;

					} else if (field.data_type === 'Boolean') {

						var type = typeof datum;

						if ((type === 'string' && datum.toLocaleLowerCase() === 'true') ||
							(type === 'number' && datum === 1 )) {
							processedDatum = true;
						} else if ((type === 'string' && datum.toLocaleLowerCase() === 'false') ||
							(type === 'number' && datum === 0 )) {
							processedDatum = false;
						} else {
							processedDatum = datum;
						}
					} else if (field.data_type === 'DateTime') {

						var dtm = new Date(datum);
						if (!isNaN(dtm.getTime())) {

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
					else if (isPlainObject(datum))
						processedDatum = JSON.stringify(datum);
					else
						processedDatum = '\'' + datum + '\'';
				}
			} else {
				if (typeof datum === 'number')
					processedDatum = datum;
				else if (isPlainObject(datum))
					processedDatum = '\'' + JSON.stringify(datum) + '\'';
				else
					processedDatum = '\'' + datum + '\'';
			}
		} else {
			processedDatum = null;
		}

		if (!first) {
			valueList = valueList + ',' + processedDatum;
			columnList = columnList + ',' + key;
		} else {
			first = false;
			valueList = processedDatum;
			columnList = key;
		}

		callback();
	}, function () {
		client.query('insert into ' + tableName + ' (' + columnList + ') values (' + valueList + ')', function (reqErr) {
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
});

/*
 * Event to listen to in order to gracefully release all resources bound to this service.
 */
platform.on('close', function () {
	var domain = require('domain');
	var d = domain.create();

	d.once('error', function (error) {
		console.error(error);
		platform.handleException(error);
		platform.notifyClose();
		d.exit();
	});

	d.run(function () {
		client.end();
		platform.notifyClose();
		d.exit();
	});
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options) {
	var isEmpty = require('lodash.isempty');

	try {
		parseFields = JSON.parse(options.fields);
	}
	catch (ex) {
		platform.handleException(new Error('Invalid option parameter: fields. Must be a valid JSON String.'));

		return setTimeout(function () {
			process.exit(1);
		}, 2000);
	}

	async.forEachOf(parseFields, function (field, key, callback) {
		if (isEmpty(field.source_field)) {
			callback(new Error('Source field is missing for ' + key + ' in PostgreSQL Plugin'));
		} else if (field.data_type && (field.data_type !== 'String' && field.data_type !== 'Integer' &&
			field.data_type !== 'Float' && field.data_type !== 'Boolean' &&
			field.data_type !== 'DateTime')) {
			callback(new Error('Invalid Data Type for ' + key + ' allowed data types are (String, Integer, Float, Boolean, DateTime) in PostgreSQL Plugin'));
		} else
			callback();
	}, function (e) {
		if (e) {
			console.error('Error parsing JSON field configuration for PostgreSQL.', e);
			platform.handleException(e);
			return;
		}

		var Pg = require('pg').native;
		var connection = 'postgres://' + options.user + ':' + options.password + '@' + options.host;

		if (options.port)
			connection = connection + ':' + options.port;

		connection = connection + '/' + options.database;

		client = new Pg.Client(connection);

		tableName = options.table;

		client.connect(function (err) {
			if (err) {
				console.error('Error connecting in PostgreSQL.', err);
				platform.handleException(err);

				return setTimeout(function () {
					process.exit(1);
				}, 2000);
			} else {
				platform.log('PostgreSQL Storage initialized.');
				platform.notifyReady();
			}
		});
	});
});