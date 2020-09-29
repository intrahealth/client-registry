# System Requirements

## IT Resource Planning

Benchmarking will be completed in future phases to make recommendations for medium to heavy workloads. The below resource suggestions should be revised based on benchmarking for the particular context into which OpenCR is being deployed.

### Servers

For an MVP in a production environment where potential data loss is acceptable, a single large server can be used. ES has high memory requirements. 

### CPU

* 2-8 cores available for the OpenCR platform apps.

### Memory

Memory usage depends on the number of records and the performance required. At minimum: 32GB with 24GB free for OpenCR is recommended for light loads if using one VM.

* 16GB minimum for ElasticSearch with 32GB preferred or 64GB for high volume: Follow the guidelines provided by the maintainers [here](https://www.elastic.co/guide/en/elasticsearch/guide/current/hardware.html#_memory). 
* 8GB for OpenHIM, mediator, Postgres, and HAPI FHIR Server.

### Disk Space

This depends heavily on the workload. Expect 200GB at minimum per node.