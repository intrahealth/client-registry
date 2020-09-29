# Backup and Recovery

# Backup

The primary datastore is the database of HAPI FHIR Server. This means that while an ES cluster should be backed-up, the ES index can be rebuilt from HAPI. 

* Either Postgres or MySQL are recommended to be used with HAPI FHIR Server. In production, database should be cloned or replicas created and cloned and those backups tested.

* Depending on the database, there are separate processes to backup data itself in a database and information about users, groups and other metadata. 

* It is recommended to create a backup and recovery policy (data and metadata, timeframes, full-versus-incremental, from replicas or not).

# Recovery Policy

* Backups should be tested in a non-production system for their ability to be used for recovery. There are existing online resources on how to test backups. 

* A backup policy should include scheduled recovery tests to ensure that backups are suitable.