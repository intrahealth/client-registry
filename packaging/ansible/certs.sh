#!/usr/bin/env bash
set -ex

# this is a utility program to help with qa. do not use for production.

if [[ $# -eq 0 ]] ; then
    echo 'provide one IP address or domain, e.g. 172.16.168.165 or localhost or www.example.com'
    exit 0
fi

echo "generating self-signed server cert for $1\n\n"

# create server certs without pass phrase. 
openssl req -x509 -newkey rsa:4096 -keyout server_key.pem -out server_cert.pem -days 365 -subj "/CN=$1" -nodes
openssl x509 -in server_cert.pem -text | grep "Subject: CN"

openssl req -newkey rsa:4096 -keyout ansible_key.pem -out ansible_csr.pem -nodes -days 365 -subj "/CN=ansible"
openssl x509 -req -in ansible_csr.pem -CA server_cert.pem -CAkey server_key.pem -out ansible_cert.pem -set_serial 01 -days 36500
openssl pkcs12 -export -in ansible_cert.pem -inkey ansible_key.pem -out ansible.p12

# backup existing server cert
mv ../../server/certificates/server_cert.pem ../../server/certificates/server_cert.pem.bak
mv ../../server/certificates/server_key.pem ../../server/certificates/server_key.pem.bak
# move new server cert in
cp server_cert.pem ../../server/certificates/server_cert.pem
cp server_key.pem ../../server/certificates/server_key.pem

# add client certs
cp ansible_key.pem ../../server/sampleclientcertificates/
cp ansible_csr.pem ../../server/sampleclientcertificates/
cp ansible_cert.pem ../../server/sampleclientcertificates/
cp ansible.p12 ../../server/sampleclientcertificates/

echo "fin"





