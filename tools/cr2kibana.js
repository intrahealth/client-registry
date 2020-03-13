const axios = require('axios')
const http = require('http')
const levenshtein = require('damerau-levenshtein')

http.globalAgent.maxSockets = 16

var resources = []
var cruid = {}
var queries = 0
var fetchall = true

const addData = ( data ) => {
	let next = null
  if ( data.link && data.link.length > 0 ) {
		for ( link of data.link ) {
			if ( link.relation === "next" ) {
				next = link.url
			}
		}
  }
	if ( next && fetchall ) {
		// fetchall = false
		queries++
  	axios.get( next ).then( ( response ) => {
			queries--
			addData( response.data )
   	} ).catch( ( err ) => {
     	console.log( err )
  	} )
	}
	for( let entry of data.entry ) {
		if ( entry.search.mode === "match" ) {
			axios.post( 'http://localhost:9200/cr_cruid/_doc/'+entry.resource.id, {
			  id: entry.resource.id,
				matches: ( entry.resource.link ? entry.resource.link.length : 0 ),
				update: entry.resource.meta.lastUpdated
			} ).then( (response) => {
				console.log(entry.resource.id+" "+response.status)
			} ).catch( (err) => {
				console.log(err)
			} )
		} else if ( entry.search.mode === "include" ) {
			let id = entry.resource.identifier.find( ( ident ) => ident.system === "http://clientregistry.org/openmrs" )
			axios.post( 'http://localhost:9200/cr_resource/_doc/'+entry.resource.id, {
				id: entry.resource.id,
				ident: id.value,
				cruid: entry.resource.link[0].other.reference.substring( 8 ),
				update: entry.resource.meta.lastUpdated
			} ).then( (response) => {
				console.log(entry.resource.id+" "+response.status)
			} ).catch( (err) => {
				console.log( err )
			} )
		}
	}
}

addData( { 
  link:
   [ { relation: 'next',
       url:
        'http://localhost:8081/hapi/fhir/Patient?_tag=5c827da5-4858-4f3d-a50c-62ece001efea&_total=accurate&_count=200&_include=Patient:link' } ],
  entry: []
} )

