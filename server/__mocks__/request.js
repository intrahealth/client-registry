'use strict'

const hash = require('object-hash')
const request = jest.genMockFromModule('request')

let fhirResults = {}
let fhirErrors = {}

function __hashObject( obj ) {
  let objHash = ""
  if ( obj && Object.keys(obj).length > 0 ) {
    objHash = hash( obj )
  }
  return objHash
}

function __setFhirResults( url, data, newFhirResults ) {
  let objHash = __hashObject( data )
  fhirResults[ url + objHash ] = newFhirResults
}

function __setFhirError( url, data, status, newFhirResults ) {
  let objHash = __hashObject( data )
  fhirErrors[ url + objHash ] = { data: newFhirResults, status: status }
}

function get( options, callback ) {
  let url = options.url
  let objHash = __hashObject( null )
  if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
    callback( fhirErrors[ url + objHash  ] )
  } else {
    callback( null, { statusCode: 200 }, fhirResults[url+objHash] )
  }
}

function put( url, data, config ) {
  let objHash = __hashObject( data )
  /* Needs to be redone for request results 
  return new Promise( (resolve, reject) => {
    if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
      reject( { response: fhirErrors[ url + objHash ] } )
    } else {
      resolve( { data: fhirResults[ url + objHash ], status: 200 } )
    }
  } )
  */
}

function post( url, data, config ) {
  let objHash = __hashObject( data )
  /* Needs to be redone for request results 
  return new Promise( (resolve, reject) => {
    if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
      reject( { response: fhirErrors[ url + objHash ] } )
    } else {
      let response = { ...fhirResults[ url + objHash ] }
      // overwrite the id like the server would on a create (or add it)
      response.id = "1"
      resolve( { data: response, status: 201 } )
    }
  } )
  */
}

function remove( url, config ) {
  let paramHash = __hashObject( config.params )
  /* Needs to be redone for request results 
  return new Promise( (resolve, reject) => {
    if ( fhirErrors.hasOwnProperty( url + paramHash ) ) {
      reject( { response: fhirErrors[ url + paramHash ] } )
    } else {
      resolve( { data: fhirResults[ url + paramHash ], status: 200 } )
    }
  } )
  */
}

request.__setFhirResults = __setFhirResults
request.__setFhirError = __setFhirError
request.get = get
request.put = put
request.post = post
request.delete = remove

module.exports = request
