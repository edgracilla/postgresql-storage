'use strict'

const reekoh = require('reekoh')
const plugin = new reekoh.plugins.Storage()

const pg = require('pg').native
const async = require('async')
const moment = require('moment')
const isNil = require('lodash.isnil')
const isEmpty = require('lodash.isempty')
const isNumber = require('lodash.isnumber')

const isString = require('lodash.isstring')
const isBoolean = require('lodash.isboolean')
const isPlainObject = require('lodash.isplainobject')

let tableName = null
let fieldMapping = null
let connectionString = null

let insertData = (data, callback) => {
  pg.connect(connectionString, (connectionError, client, done) => {
    if (connectionError) return callback(connectionError)

    let query = `insert into ${tableName} (${data.columns.join(', ')}) values (${data.values.join(', ')})`

    client.query(query, data.data, (insertError) => {
      done() // Release connection and bring back to pool.

      callback(insertError)
    })
  })
}

let processData = (data, callback) => {
  let keyCount = 0
  let processedData = {
    columns: [],
    values: [],
    data: []
  }

  async.forEachOf(fieldMapping, (field, key, done) => {
    keyCount++

    processedData.columns.push(`"${key}"`)
    processedData.values.push(`$${keyCount}`)

    let datum = data[field.source_field]
    let processedDatum = null

    if (!isNil(datum) && !isEmpty(field.data_type)) {
      try {
        if (field.data_type === 'String') {
          if (isPlainObject(datum)) {
            processedDatum = JSON.stringify(datum)
          } else {
            processedDatum = `${datum}`
          }
        } else if (field.data_type === 'Integer') {
          if (isNumber(datum)) {
            processedDatum = datum
          } else {
            let intData = parseInt(datum)

            if (isNaN(intData)) {
              processedDatum = datum // store original value
            } else {
              processedDatum = intData
            }
          }
        } else if (field.data_type === 'Float') {
          if (isNumber(datum)) {
            processedDatum = datum
          } else {
            let floatData = parseFloat(datum)

            if (isNaN(floatData)) {
              processedDatum = datum
            } else { // store original value
              processedDatum = floatData
            }
          }
        } else if (field.data_type === 'Boolean') {
          if (isBoolean(datum)) {
            processedDatum = datum
          } else {
            if ((isString(datum) && datum.toLowerCase() === 'true') || (isNumber(datum) && datum === 1)) {
              processedDatum = true
            } else if ((isString(datum) && datum.toLowerCase() === 'false') || (isNumber(datum) && datum === 0)) {
              processedDatum = false
            } else {
              processedDatum = !!datum
            }
          }
        } else if (field.data_type === 'DateTime') {
          if (moment(datum).isValid() && isEmpty(field.format)) {
            processedDatum = datum
          } else if (moment(datum).isValid() && !isEmpty(field.format)) {
            processedDatum = moment(datum).format(field.format)
          } else {
            processedDatum = datum
          }
        }
      } catch (e) {
        if (isPlainObject(datum)) {
          processedDatum = JSON.stringify(datum)
        } else {
          processedDatum = datum
        }
      }
    } else if (!isNil(datum) && isEmpty(field.data_type)) {
      if (isPlainObject(datum)) {
        processedDatum = JSON.stringify(datum)
      } else { processedDatum = `${datum}` }
    } else {
      processedDatum = null
    }

    processedData.data.push(processedDatum)

    done()
  }, () => {
    callback(null, processedData)
  })
}

plugin.on('data', (data) => {
  if (isPlainObject(data)) {
    processData(data, (error, processedData) => {
      if (error) return console.log(error)

      insertData(processedData, (error) => {
        if (!error) {
          // process.send({type: 'processed'})
          plugin.log(JSON.stringify({
            title: 'Record Successfully inserted to PostgreSQL Database.',
            data: data
          }))
        } else {
          plugin.logException(error)
        }
      })
    })
  } else if (Array.isArray(data)) {
    async.each(data, (datum) => {
      processData(datum, (error, processedData) => {
        if (error) return console.log(error)

        insertData(processedData, (error) => {
          if (!error) {
            process.send({type: 'processed'})
            plugin.log(JSON.stringify({
              title: 'Record Successfully inserted to PostgreSQL Database.',
              data: datum
            }))
          } else {
            plugin.logException(error)
          }
        })
      })
    })
  } else {
    plugin.logException(new Error(`Invalid data received. Data must be a valid Array/JSON Object or a collection of objects. Data: ${data}`))
  }
})

plugin.once('ready', () => {
  let options = plugin.config

  tableName = options.table
  fieldMapping = options.fieldMapping

  async.forEachOf(fieldMapping, function (field, key, callback) {
    if (isEmpty(field.source_field)) {
      callback(new Error('Source field is missing for ' + key + ' in PostgreSQL Plugin'))
    } else if (field.data_type && (field.data_type !== 'String' && field.data_type !== 'Integer' && field.data_type !== 'Float' && field.data_type !== 'Boolean' && field.data_type !== 'DateTime')) {
      callback(new Error('Invalid Data Type for ' + key + ' in field mapping. Allowed data types are String, Integer, Float, Boolean, DateTime'))
    } else {
      callback()
    }
  }, function (fieldMapError) {
    if (fieldMapError) {
      console.error('Error parsing field mapping.', fieldMapError)
      plugin.logException(fieldMapError)

      return setTimeout(() => {
        process.exit(1)
      }, 2000)
    }

    let host = options.host
    let auth = ''

    if (options.port) {
      host = `${host}:${options.port}`
    }

    if (options.user) { auth = `${options.user}` }

    if (options.password) {
      auth = `${auth}:${options.password}@`
    } else if (options.user) {
      auth = `${auth}:@`
    }

    connectionString = `postgres://${auth}${host}/${options.database}`

    pg.connect(connectionString, function (connectionError, client, done) {
      if (connectionError) {
        console.error('Error connecting to PostgreSQL Database Server.', connectionError)
        plugin.logException(connectionError)

        return setTimeout(function () {
          process.exit(1)
        }, 2000)
      } else {
        plugin.log('PostgreSQL Storage initialized.')
        plugin.emit('init')
        done()
      }
    })
  })
})

module.exports = plugin
