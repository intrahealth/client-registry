# Ansible

This documents how to use Ansible playbooks to set up a production-like server installation. It differs from a production installation in that certificates must not be self-signed in a production environment.

> These steps are for installing on a server OS directly and require experience with remote configuration and Linux administration.

## Preparation

You must have a local VM or remote server. See `/packaging/vagrant/centos` for a Vagrant VM (CentOS 7) script for working example of creating a local VM.

Clone the main repository. The Ansible playbooks and templates are in that folder.

```
git clone https://github.com/intrahealth/client-registry.git
cd client-registry/packaging/ansible
```

### SSH

Create a VM. Make sure to include a public ssh key for the user who will install prerequisites. Your SSH public key should be in `.ssh/authorized_keys` on the remote host, ie:
```sh
cat ~/.ssh/id_rsa.pub | ssh user@remotehost 'cat >> .ssh/authorized_keys'
```

### Certificates

> Warning: Self-signed certificates must only be created for testing and demonstrations and in non-production settings.

Two certificate pairs are required, one pair for the server and one for the client generated from the server's. The existing self-signed server certs use localhost as the CN.

This can be seen with the following for any cert:
```sh
$ openssl x509 -in ../../server/certificates/server_cert.pem -text
...
        Subject: CN = localhost, O = Client Registry
...
```

This means that new server and client certificates need to be generated with the IP address or domain for clients to access the client registry if it is not running on localhost.

Run the following to create a new server cert/key pair. It will ask for a pass phrase (which is required in production) but -nodes option squashes that.
```
openssl req -x509 -newkey rsa:4096 -keyout server_key.pem -out server_cert.pem -days 365 -subj "/CN=172.16.168.165" -nodes
```

This will create two files, server_key.pem and server_cert.pem.

We can inspect the certificate to verify it has the IP address in the subject.
```sh
$ openssl x509 -in server_cert.pem -text
...
       Subject: CN = 172.16.168.165
...
```

Now it is necessary to create new a new client cert based on the server cert. A key is first created, then the certificate, and they are packaged together in a p12 file.

```sh
openssl req -newkey rsa:4096 -keyout ansible_key.pem -out ansible_csr.pem -nodes -days 365 -subj "/CN=ansible"
# requires pass phrase of server key
openssl x509 -req -in ansible_csr.pem -CA server_cert.pem -CAkey server_key.pem -out ansible_cert.pem -set_serial 01 -days 36500
# requires specifying an export key
openssl pkcs12 -export -in ansible_cert.pem -inkey ansible_key.pem -out ansible.p12
```

The final steps are to replace server and client certs

Backup and replace server certs
```sh
# backup existing server cert
mv ../../server/certificates/server_cert.pem ../../server/certificates/server_cert.pem.bak
mv ../../server/certificates/server_key.pem ../../server/certificates/server_key.pem.bak
# move new server cert in
cp server_cert.pem ../../server/certificates/server_cert.pem
cp server_key.pem ../../server/certificates/server_key.pem
```

Add client certs
```sh
# add client certs
cp ansible.pem ../../server/sampleclientcertificates/
cp ansible_csr.pem ../../server/sampleclientcertificates/
cp ansible_cert.pem ../../server/sampleclientcertificates/
cp ansible.p12 ../../server/sampleclientcertificates/
```

## Specify hosts

Hosts can be specified in inventory files or on the command line. To use Ansible with an inventory file, you must create a file or edit the one in the repository. There are yaml and ini formats supported.

A `hosts` file that has an entry for one server would be:
```ini
[servers]
172.16.174.137
```

Note that `[servers]` is not necessary, it is way to tag groups of servers.

To use the hosts file:
```
ansible-playbook -i hosts someplaybook.yaml
```

Alternately, hosts may be specified on the command line (the comma is necessary even if there is only one host):
```
ansible-playbook -i 172.16.168.158, someplaybook.yaml
```

## opencr user (optional)

A example playbook is provided to show how to create a `opencr` user with sudo permissions using Ansible to be used with the host. 

Create the `opencr` user and gives it sudo access:
```sh
ansible-playbook -i hosts user.yaml
```

## Installation

```sh 
ansible-playbook -i hosts prep_centos.yaml -e user=opencr
ansible-playbook -i hosts elasticsearch.yaml -e user=opencr
ansible-playbook -i hosts tomcat.yaml -e user=opencr
ansible-playbook -i hosts postgres.yaml -e user=opencr -e pgpass=hapi
ansible-playbook -i hosts hapi.yaml -e user=opencr
ansible-playbook -i hosts opencr.yaml -e user=opencr
```

Visit: https://ipaddress:3000/crux

HTTPS must be used.


## Add additional user public keys

As necessary, add additional ssh keys to the user `opencr`. (Ensure that the user's public key is available on github, ie. https://github.com/citizenrich.keys):
```
ansible-playbook -i hosts keys.yaml
```