# Internals

## ElasticSearch

ES is a web service around the Apache Software Foundation-supported Lucene search engine. ES provides a JSON-based REST API, cluster management, and other value-add on top of Lucene. Many of the features discussed below are actually in Lucene, and are not specific to ES, although these docs refer to ES as including Lucene features. This can be confusing. ES means ES which includes Lucene.

### Mapping

Data fields to be indexed in ES require that they first be mapped. The CR mediator takes a mapping config file and generates the mapping based on it. Then, records are submitted to and indexed by ES. Indexes are created separated into segments. Segments can be on one system or across server nodes in cluster. When searches happen, the segments are searched in parallel, and then the results merged. 

For more information, see: Elasticsearch from the bottom up (EuroPython 2014 - Start at 18:28 unless you want to get deep into Lucene.): https://www.youtube.com/watch?v=PpX7J-G2PEo

### ES Filters versus Queries

An important distinction is between filters and queries in ES. For CR purposes, filters can be used for blocking. Queries result in a score that is assigned to the result based on how well it matches the query. For more, eee: https://logz.io/blog/elasticsearch-queries/ Note that filters are cached, and thus faster. Also, query clauses can be used as either a filter or a query. Since filters are boolean (true/false), they are not scored.

There are queries of diverse types, including Boolean, compound (chaining queries together), fuzzy matching, and other types. Queries result in a score that is assigned to the result based on how well it matches the query. With regard to risk for the Uganda use case, we have included blocking (filters) to meet the use requirements and the required query types.

For more, see [ElasticSearch Queries](https://logz.io/blog/elasticsearch-queries/)
And the [ES Query Domain Specific Language (DSL)](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html)
