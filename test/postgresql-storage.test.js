/* global describe, it, before, after */

'use strict'


const pg = require('pg').native
const amqp = require('amqplib')
const moment = require('moment')
const should = require('should')

const _ID = new Date().getTime()
const INPUT_PIPE = 'demo.pipe.storage'
const BROKER = 'amqp://guest:guest@127.0.0.1/'

let _app = null
let _conn = null
let _channel = null

/*

CREATE TABLE reekoh_table (
  _id bigint primary key,
  co2_field varchar(40) NOT NULL,
  temp_field int NOT NULL,
  quality_field decimal NOT NULL,
  reading_time_field timestamp NULL,
  metadata_field text NOT NULL,
  random_data_field text NOT NULL,
  is_normal_field boolean
);

*/

let record = {
  _id: _ID,
  co2: '11%',
  temp: 23,
  quality: 11.25,
  reading_time: '2015-11-27T11:04:13.539Z',
  metadata: '{"metadata_json": "reekoh metadata json"}',
  random_data: 'abcdefg',
  is_normal: true
}

let conf = {
  host: 'localhost',
  port: 5432,
  user: 'root',
  password: 'verysecret',
  database: 'reekoh',
  table: 'reekoh_table',
  fieldMapping: {
    _id: {
      source_field: '_id',
      data_type: 'Integer'
    },
    co2_field: {
      source_field: 'co2',
      data_type: 'String'
    },
    temp_field: {
      source_field: 'temp',
      data_type: 'Integer'
    },
    quality_field: {
      source_field: 'quality',
      data_type: 'Float'
    },
    reading_time_field: {
      source_field: 'reading_time',
      data_type: 'DateTime',
      format: 'YYYY-MM-DDTHH:mm:ss.SSSSZ'
    },
    metadata_field: {
      source_field: 'metadata',
      data_type: 'String'
    },
    random_data_field: {
      source_field: 'random_data'
    },
    is_normal_field: {
      source_field: 'is_normal',
      data_type: 'Boolean'
    }
  }
}

describe('Postgres Storage', function () {
  this.slow(5000)

  before('init', () => {
    process.env.BROKER = BROKER
    process.env.INPUT_PIPE = INPUT_PIPE
    process.env.CONFIG = JSON.stringify(conf)

    amqp.connect(BROKER).then((conn) => {
      _conn = conn
      return conn.createChannel()
    }).then((channel) => {
      _channel = channel
    }).catch((err) => {
      console.log(err)
    })
  })

  after('terminate child process', function () {
    _conn.close()
  })

  describe('#start', function () {
    it('should start the app', function (done) {
      this.timeout(8000)
      _app = require('../app')
      _app.once('init', done)
    })
  })

  describe('#data', function () {
    it('should process the data', function (done) {
      this.timeout(15000)
      _channel.sendToQueue(INPUT_PIPE, new Buffer(JSON.stringify(record)))
      setTimeout(done, 10000)
    })

    it('should have inserted the data', function (done) {
      this.timeout(10000)

      setTimeout(() => {
        let connection = 'postgres://' + conf.user + ':' + conf.password + '@' + conf.host + ':' + conf.port + '/' + conf.database
        let client = new pg.Client(connection)

        client.connect(function (err) {
          if (err) return console.log(err)

          client.query('SELECT * FROM ' + conf.table + ' WHERE _id = ' + _ID, function (err, result) {
            if (err) return console.log(err)

            should.exist(result.rows[0])
            let resp = result.rows[0]

            let cleanMetadata = resp.metadata_field.replace(/\\"/g, '"')

            let str2 = JSON.stringify(cleanMetadata)
            let str = JSON.stringify(record.metadata)

            should.equal(record.co2, resp.co2_field, 'Data validation failed. Field: co2')
            should.equal(record.temp, resp.temp_field, 'Data validation failed. Field: temp')
            should.equal(record.quality, resp.quality_field, 'Data validation failed. Field: quality')
            should.equal(record.random_data, resp.random_data_field, 'Data validation failed. Field: random_data')
            should.equal(moment(record.reading_time).format('YYYY-MM-DD HH:mm:ss.SSSSZ'), moment(resp.reading_time_field).format('YYYY-MM-DD HH:mm:ss.SSSSZ'), 'Data validation failed. Field: reading_time')
            should.equal(str, str2, 'Data validation failed. Field: metadata')

            done()
          })
        })
      }, 5000)
    })
  })
})
