# Example API Query (cURL)

## Certificates (Mandatory)

A system querying the Client Registry needs a server-issued certificate or it will not be authorized to use the service.

The way that this works is that a server creates a certificate for a client. The certificate is signed by the server issuing it. The querying system then uses that certificate that has been issued to them in their requests. The server's public key is used by the querying system to verify that the certificate being sent is how the server verifies that the certificate was created by them.

There is a set of generated certificates for testing and demonstrations. They are not appropriate for production.

## A Simple CLI Query

Inside /client-registry/server directory, a cURL query using the provided example JSON file would be:

```sh
curl --cert sampleclientcertificates/openmrs.p12 --cert-type p12 --cacert certificates/server_cert.pem -d @/Users/richard/src/github.com/openhie/client-registry/DemoData/patient1_openmrs.json -H "Content-Type: application/json" -XPOST https://localhost:3000/Patient
```

Should result in a successful result in stdout:
```sh
info: Received a request to add new patient {"timestamp":"2020-01-28 14:29:20"}
info: Searching to check if the patient exists {"timestamp":"2020-01-28 14:29:20"}
info: Getting http://localhost:8080/baseR4/Patient?identifier=431287 from server {"timestamp":"2020-01-28 14:29:20"}
info: Patient [{"system":"http://clientregistry.org/openmrs","value":"431287"},{"system":"http://system1.org","value":"12349","period":{"start":"2001-05-06"},"assigner":{"display":"test Org"}}] doesnt exist, adding to the database {"timestamp":"2020-01-28 14:29:20"}
```