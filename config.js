'use strict'

const validate = require('validate.js')

let constraints = {
  host: {
    presence: true
  },
  port: {
    presence: true
  },
  database: {
    presence: true
  },
  table: {
    presence: true
  },
  user: {
    presence: false
  },
  password: {
    presence: false
  },
  field_mapping: {
    presence: true
  }
}

module.exports.validate = (attribs) => {
  return validate(attribs, constraints)
}

