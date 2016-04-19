'use strict';

var pg            = require('pg').native,
	knex          = require('knex')({client: 'pg'}),
	async         = require('async'),
	isNil         = require('lodash.isnil'),
	moment        = require('moment'),
	isArray       = require('lodash.isarray'),
	isEmpty       = require('lodash.isempty'),
	isNumber      = require('lodash.isnumber'),
	platform      = require('./platform'),
	isString      = require('lodash.isstring'),
	isBoolean     = require('lodash.isboolean'),
	isPlainObject = require('lodash.isplainobject'),
	connectionString, fieldMapping, tableName, client;

let insertData = function (data, callback) {
	pg.connect(connectionString, function (connectionError, client, done) {
		if (connectionError) return callback(connectionError);

		client.query(knex(tableName).insert(data), (insertError) => {
			done();

			if (!insertError) {
				platform.log(JSON.stringify({
					title: 'Record Successfully inserted to PostgreSQL Database.',
					data: data
				}));
			}

			callback(insertError);
		});
	});
};

let processData = function (data, callback) {
	let processedData = {};

	async.forEachOf(fieldMapping, (field, key, done) => {
		let datum = data[field.source_field],
			processedDatum;

		if (!isNil(datum) && !isEmpty(field.data_type)) {
			try {
				if (field.data_type === 'String') {
					if (isPlainObject(datum))
						processedDatum = JSON.stringify(datum);
					else
						processedDatum = `${datum}`;
				}
				else if (field.data_type === 'Integer') {
					if (isNumber(datum))
						processedDatum = datum;
					else {
						let intData = parseInt(datum);

						if (isNaN(intData))
							processedDatum = datum; //store original value
						else
							processedDatum = intData;
					}
				}
				else if (field.data_type === 'Float') {
					if (isNumber(datum))
						processedDatum = datum;
					else {
						let floatData = parseFloat(datum);

						if (isNaN(floatData))
							processedDatum = datum; //store original value
						else
							processedDatum = floatData;
					}
				}
				else if (field.data_type === 'Boolean') {
					if (isBoolean(datum))
						processedDatum = datum;
					else {
						if ((isString(datum) && datum.toLowerCase() === 'true') || (isNumber(datum) && datum === 1))
							processedDatum = true;
						else if ((isString(datum) && datum.toLowerCase() === 'false') || (isNumber(datum) && datum === 0))
							processedDatum = false;
						else
							processedDatum = (datum) ? true : false;
					}
				}
				else if (field.data_type === 'DateTime') {
					if (moment(datum).isValid() && isEmpty(field.format))
						processedDatum = datum;
					else if (moment(datum).isValid() && !isEmpty(field.format))
						processedDatum = moment(datum).format(field.format);
					else
						processedDatum = datum;
				}
			}
			catch (e) {
				if (isPlainObject(datum))
					processedDatum = JSON.stringify(datum);
				else
					processedDatum = datum;
			}
		}
		else if (!isNil(datum) && isEmpty(field.data_type)) {
			if (isPlainObject(datum))
				processedDatum = JSON.stringify(datum);
			else
				processedDatum = `${datum}`;
		}
		else
			processedDatum = null;

		processedData[key] = processedDatum;

		done();
	}, () => {
		callback(null, processedData);
	});
};

platform.on('data', function (data) {
	if (isPlainObject(data)) {
		processData(data, (error, processedData) => {
			insertData(processedData, (error) => {
				if (error) platform.handleException(error);
			});
		});
	}
	else if (isArray(data)) {
		async.each(data, function (datum) {
			processData(datum, (error, processedData) => {
				insertData(processedData, (error) => {
					if (error) platform.handleException(error);
				});
			});
		});
	}
	else
		platform.handleException(new Error(`Invalid data received. Data must be a valid Array/JSON Object or a collection of objects. Data: ${data}`));
});

/*
 * Event to listen to in order to gracefully release all resources bound to this service.
 */
platform.on('close', function () {
	var d = require('domain').create();

	d.once('error', function (error) {
		console.error(error);
		platform.handleException(error);
		platform.notifyClose();
		d.exit();
	});

	d.run(function () {
		pg.end();
		platform.notifyClose();
		d.exit();
	});
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options) {
	tableName = options.table;

	async.waterfall([
		async.constant(options.field_mapping || '{}'),
		async.asyncify(JSON.parse),
		(obj, done) => {
			fieldMapping = obj;
			done();
		}
	], (parseError) => {
		if (parseError) {
			platform.handleException(new Error('Invalid field mapping. Must be a valid JSON String.'));

			return setTimeout(function () {
				process.exit(1);
			}, 2000);
		}

		let isEmpty = require('lodash.isempty');

		async.forEachOf(fieldMapping, function (field, key, callback) {
			if (isEmpty(field.source_field))
				callback(new Error('Source field is missing for ' + key + ' in PostgreSQL Plugin'));
			else if (field.data_type && (field.data_type !== 'String' && field.data_type !== 'Integer' &&
				field.data_type !== 'Float' && field.data_type !== 'Boolean' &&
				field.data_type !== 'DateTime')) {

				callback(new Error('Invalid Data Type for ' + key + ' in field mapping. Allowed data types are String, Integer, Float, Boolean, DateTime'));
			}
			else
				callback();
		}, function (fieldMapError) {
			if (fieldMapError) {
				console.error('Error parsing field mapping.', fieldMapError);
				platform.handleException(fieldMapError);

				return setTimeout(() => {
					process.exit(1);
				}, 2000);
			}

			let host = options.host, auth = '';

			if (options.user) auth = `${options.user}:${options.password}@`;
			if (options.port) host = `${host}:${options.port}`;

			connectionString = `postgres://${auth}${host}/${options.database}`;

			pg.connect(connectionString, function (connectionError, client, done) {
				if (connectionError) {
					console.error('Error connecting to PostgreSQL Database Server.', connectionError);
					platform.handleException(connectionError);

					return setTimeout(function () {
						process.exit(1);
					}, 2000);
				} else {
					platform.log('PostgreSQL Storage initialized.');
					platform.notifyReady();
					done();
				}
			});
		});
	});
});