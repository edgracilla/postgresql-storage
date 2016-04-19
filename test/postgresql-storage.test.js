'use strict';

const HOST     = 'reekoh-postgresql.cg1corueo9zh.us-east-1.rds.amazonaws.com',
	  PORT     = 5432,
	  USER     = 'reekoh',
	  PASSWORD = 'rozzwalla',
	  DATABASE = 'reekoh',
	  TABLE    = 'reekoh_table',
	  _ID      = new Date().getTime();

var cp     = require('child_process'),
	assert = require('assert'),
	should = require('should'),
	moment = require('moment'),
	storage;

var record = {
	_id: _ID,
	co2: '11%',
	temp: 23,
	quality: 11.25,
	reading_time: '2015-11-27T11:04:13.539Z',
	metadata: '{"metadata_json": "reekoh metadata json"}',
	random_data: 'abcdefg',
	is_normal: true
};

describe('Storage', function () {
	this.slow(5000);

	after('terminate child process', function () {
		storage.send({
			type: 'close'
		});

		setTimeout(function () {
			storage.kill('SIGKILL');
		}, 3000);
	});

	describe('#spawn', function () {
		it('should spawn a child process', function () {
			assert.ok(storage = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function (done) {
			this.timeout(5000);

			storage.on('message', function (message) {
				if (message.type === 'ready')
					done();
			});

			storage.send({
				type: 'ready',
				data: {
					options: {
						host: HOST,
						port: PORT,
						user: USER,
						password: PASSWORD,
						database: DATABASE,
						table: TABLE,
						field_mapping: JSON.stringify({
							_id: {source_field: '_id', data_type: 'Integer'},
							co2_field: {source_field: 'co2', data_type: 'String'},
							temp_field: {source_field: 'temp', data_type: 'Integer'},
							quality_field: {source_field: 'quality', data_type: 'Float'},
							reading_time_field: {
								source_field: 'reading_time',
								data_type: 'DateTime',
								format: 'YYYY-MM-DDTHH:mm:ss.SSSSZ'
							},
							metadata_field: {source_field: 'metadata', data_type: 'String'},
							random_data_field: {source_field: 'random_data'},
							is_normal_field: {source_field: 'is_normal', data_type: 'Boolean'}
						})
					}
				}
			}, function (error) {
				assert.ifError(error);
			});
		});
	});

	describe('#data', function () {
		it('should process the data', function (done) {
			storage.send({
				type: 'data',
				data: record
			}, done);
		});
	});

	describe('#data', function () {
		it('should have inserted the data', function (done) {
			this.timeout(10000);

			setTimeout(() => {
				var pg = require('pg').native;

				var connection = 'postgres://' + USER + ':' + PASSWORD + '@' + HOST + ':' + PORT + '/' + DATABASE;

				var client = new pg.Client(connection);
				client.connect(function (err) {
					client.query('SELECT * FROM ' + TABLE + ' WHERE _id = ' + _ID, function (err, result) {
						console.log(result);
						should.exist(result.rows[0]);
						var resp = result.rows[0];

						var cleanMetadata = resp.metadata_field.replace(/\\"/g, '"');
						var str = JSON.stringify(record.metadata);
						var str2 = JSON.stringify(cleanMetadata);

						should.equal(record.co2, resp.co2_field, 'Data validation failed. Field: co2');
						should.equal(record.temp, resp.temp_field, 'Data validation failed. Field: temp');
						should.equal(record.quality, resp.quality_field, 'Data validation failed. Field: quality');
						should.equal(record.random_data, resp.random_data_field, 'Data validation failed. Field: random_data');
						should.equal(moment(record.reading_time).format('YYYY-MM-DD HH:mm:ss.SSSSZ'),
							moment(resp.reading_time_field).format('YYYY-MM-DD HH:mm:ss.SSSSZ'),
							'Data validation failed. Field: reading_time');
						should.equal(str, str2, 'Data validation failed. Field: metadata');

						done();
					});
				});
			}, 5000);
		});
	});
});