'use strict';

const hash = require('object-hash');
const request = jest.genMockFromModule('request');

let fhirResults = {};
let fhirErrors = {};

function __hashObject( obj ) {
  let objHash = "";
  if ( obj && Object.keys(obj).length > 0 ) {
    objHash = hash( obj );
  }
  return objHash;
}

function __setFhirResults( url, data, newFhirResults ) {
  let objHash = __hashObject( data );
  fhirResults[ url + objHash ] = newFhirResults;
}

function __setFhirError( url, data, status, newFhirResults ) {
  let objHash = __hashObject( data );
  fhirErrors[ url + objHash ] = { data: newFhirResults, statusCode: status };
}

function get( options, callback ) {
  let url = decodeURIComponent(options.url);
  let objHash = __hashObject( null );
  if(options.json) {
    objHash = __hashObject( options.json );
  }
  if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
    callback( fhirErrors[ url + objHash  ] );
  } else {
    callback( null, { statusCode: 200 }, fhirResults[url+objHash] );
  }
}

function put( options, callback ) {
  let url = decodeURIComponent(options.url);
  let objHash = __hashObject( options.json );
  if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
    callback( fhirErrors[ url + objHash ] );
  } else {
    callback( null, { statusCode: 200 }, fhirResults[ url + objHash ] );
  }
}

function post( options, callback ) {
  let url = decodeURIComponent(options.url);
  let objHash = __hashObject( options.json );
  if ( fhirErrors.hasOwnProperty( url + objHash ) ) {
    callback( fhirErrors[ url + objHash ] );
  } else {
    let response = { ...fhirResults[ url + objHash ] };
    response.id = "1";
    callback( null, { statusCode: 201 }, response );
  }
}

function remove( options, callback ) {
  let url = decodeURIComponent(options.url);
  let paramHash = __hashObject( null );
  if ( fhirErrors.hasOwnProperty( url + paramHash ) ) {
    callback( fhirErrors[ url + paramHash ] );
  } else {
    callback( null, { statusCode: 200 }, fhirResults[ url + paramHash ] );
  }
}

request.__setFhirResults = __setFhirResults;
request.__setFhirError = __setFhirError;
request.get = get;
request.put = put;
request.post = post;
request.delete = remove;

module.exports = request;
