# How these self-signed certs were generated

## Generating server cetificate authority expiring in 365 days
```
cd client-registry/server/serverCertificates
openssl req -nodes -new -x509 -days 365 -keyout server_key.pem -out server_cert.pem -subj "/CN=localhost"
```

## Generating client certificate expiring in one year
```
cd client-registry/server/clientCertificates
openssl req -newkey rsa:4096 -keyout openmrs_key.pem -out openmrs_csr.pem -nodes -days 365 -subj "/CN=openmrs"
openssl x509 -req -in openmrs_csr.pem -CA ../serverCertificates/server_cert.pem -CAkey ../serverCertificates/server_key.pem -out openmrs_cert.pem -set_serial 01 -days 365
openssl pkcs12 -export -in openmrs_cert.pem -inkey openmrs_key.pem -out openmrs.p12
```