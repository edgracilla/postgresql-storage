/* global describe, it, before, after */

'use strict'

let pg = require('pg').native
const amqp = require('amqplib')
const moment = require('moment')
const should = require('should')
const cp = require('child_process')

const _ID = new Date().getTime()

let _storage = null
let _channel = null
let _conn = {}

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
  field_mapping: {
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
    process.env.INPUT_PIPE = 'demo.pipe.storage'
    process.env.BROKER = 'amqp://guest:guest@127.0.0.1/'
    process.env.CONFIG = JSON.stringify(conf)

    amqp.connect(process.env.BROKER)
      .then((conn) => {
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
    setTimeout(function () {
      _storage.kill('SIGKILL')
    }, 3000)
  })

  describe('#spawn', function () {
    it('should spawn a child process', function () {
      should.ok(_storage = cp.fork(process.cwd()), 'Child process not spawned.')
    })
  })

  describe('#handShake', function () {
    it('should notify the parent process when ready within 5 seconds', function (done) {
      this.timeout(5000)

      _storage.on('message', function (message) {
        if (message.type === 'ready') {
          done()
        }
      })
    })
  })

  describe('#data', function () {
    it('should process the data', function (done) {
      this.timeout(8000)

      _channel.sendToQueue(process.env.INPUT_PIPE, new Buffer(JSON.stringify(record)))

      _storage.on('message', (msg) => {
        if (msg.type === 'processed') done()
      })
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
