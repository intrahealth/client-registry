# How these self-signed certs were generated

```
openssl req -newkey rsa:4096 -keyout dhis2_key.pem -out dhis2_csr.pem -nodes -days 365 -subj "/CN=dhis2"
openssl x509 -req -in dhis2_csr.pem -CA ../certificates/server_cert.pem -CAkey ../certificates/server_key.pem -out dhis2_cert.pem -set_serial 01 -days 36500
openssl pkcs12 -export -in dhis2_cert.pem -inkey dhis2_key.pem -out dhis2.p12
```