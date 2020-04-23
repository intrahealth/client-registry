# Add Algorithms

25 types and variations of the most common algorithms are supported by OpenCR, including those through the ElasticSearch plugins: [analysis-phonetic](https://www.elastic.co/guide/en/elasticsearch/plugins/current/analysis-phonetic.html) and [string-similarity](https://github.com/intrahealth/similarity-scoring)

If more are required or revisions needed, the recommended approach is to: 

* Write and test the primary algorithm code as an ElasticSearch plugin. This ensures performance, usage in the broader ElasticSearch community, and a platform to test for accuracy.
* Add hooks into the OpenCR Service to support the algorithm. 
* Add a decision rules template to show how to use the plugin for end users.
* Determine if the plugin is required. If so, see the code in this [config](https://github.com/intrahealth/client-registry/blob/master/server/lib/prerequisites.js)