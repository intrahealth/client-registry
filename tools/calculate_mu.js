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
			cruid[ entry.resource.id ] = {
				matches: ( entry.resource.link ? entry.resource.link.length : 0 ),
				update: entry.resource.meta.lastUpdated
			}
		} else if ( entry.search.mode === "include" ) {
			let id = entry.resource.identifier.find( ( ident ) => ident.system === "http://clientregistry.org/openmrs" )
			resources.push( {
				id: entry.resource.id,
				ident: id.value,
				gender: entry.resource.gender || "",
				cruid: entry.resource.link[0].other.reference.substring( 8 ),
				update: entry.resource.meta.lastUpdated,
				family: entry.resource.name[0].family || "",
				given: ( entry.resource.name[0].given ? entry.resource.name[0].given.join(" ") : "" ),
				phone: ( entry.resource.telecom ? entry.resource.telecom.find( (telecom) => telecom.system === "phone" ).value : "" )
			} )
		}
	}
	if ( queries === 0 ) {
		//console.log(cruid)
		//console.log(resources)
		let female = resources.filter( (entry) => entry.gender === 'female' )
		console.log(female.length)
		let output = {
			pairs: { match: 0, unmatch: 0 },
			family: { match: 0, unmatch: 0 },
			given: { match: 0, unmatch: 0 },
			phone: { match: 0, unmatch: 0 },
		}
		while( entry = female.shift() ) {
			for( let compare of female ) {
				let fam_lev = levenshtein( entry.family, compare.family )
				let fam_match = fam_lev && fam_lev.steps <= 2
				let giv_lev = levenshtein( entry.given, compare.given )
				let giv_match = giv_lev && giv_lev.steps <= 2
				let phone_match = entry.phone === compare.phone
				if ( entry.cruid === compare.cruid ) {
					output.pairs.match++
					//console.log("MATCH "+entry.ident+" to "+compare.ident+": "+entry.family+" =? "+compare.family +" "+entry.given+" =? "+compare.given +" "+entry.phone+" =? "+compare.phone )
					//console.log(fam_lev,giv_lev)
					if ( fam_match ) {
						output.family.match++
					}
					if ( giv_match ) {
						output.given.match++
					}
					if ( phone_match ) {
						output.phone.match++
					}
				} else {
					output.pairs.unmatch++
					if ( fam_match ) {
						output.family.unmatch++
					}
					if ( giv_match ) {
						output.given.unmatch++
					}
					if ( phone_match ) {
						output.phone.unmatch++
					}
				}

			}
		}
		console.log(output)

		let male = resources.filter( (entry) => entry.gender === 'male' )
		console.log(male.length)
		len = male.length

		while( entry = male.shift() ) {
			for( let compare of male ) {
				let fam_lev = levenshtein( entry.family, compare.family )
				let fam_match = fam_lev && fam_lev.steps <= 2
				let giv_lev = levenshtein( entry.given, compare.given )
				let giv_match = giv_lev && giv_lev.steps <= 2
				let phone_match = entry.phone === compare.phone
				if ( entry.cruid === compare.cruid ) {
					output.pairs.match++
					if ( fam_match ) {
						output.family.match++
					}
					if ( giv_match ) {
						output.given.match++
					}
					if ( phone_match ) {
						output.phone.match++
					}
				} else {
					output.pairs.unmatch++
					if ( fam_match ) {
						output.family.unmatch++
					}
					if ( giv_match ) {
						output.given.unmatch++
					}
					if ( phone_match ) {
						output.phone.unmatch++
					}
				}

			}
		}
		console.log(output)
		let mu = {
			family: {
				m: output.family.match / output.pairs.match,
				u: output.family.unmatch / output.pairs.unmatch
			},
			given: {
				m: output.given.match / output.pairs.match,
				u: output.given.unmatch / output.pairs.unmatch
			},
			phone: {
				m: output.phone.match / output.pairs.match,
				u: output.phone.unmatch / output.pairs.unmatch
			}
		}
		console.log(mu)


	}
}

addData( { 
  link:
   [ { relation: 'next',
       url:
        'http://localhost:8081/hapi/fhir/Patient?_tag=5c827da5-4858-4f3d-a50c-62ece001efea&_total=accurate&_count=200&_include=Patient:link' } ],
  entry: []
} )

