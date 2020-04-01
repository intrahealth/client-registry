# Ansible

> This is incomplete and a work in-progress.

# Ansible

You must have a local VM or remote server. See `/packaging/vagrant/centos` for a Vagrant VM (CentOS 7) script for working example of creating a local VM.

> These steps are for installing on a server OS directly and require experience with remote configuration.

## SSH setup

Create a VM. Make sure to include a public ssh key for the user who will install prerequisites. Your SSH public key should be in `.ssh/authorized_keys` on the remote host, ie:
```sh
cat ~/.ssh/id_rsa.pub | ssh user@remotehost 'cat >> .ssh/authorized_keys'
```

## Specify hosts

Hosts can be specified in inventory files or on the command line. To use Ansible with an inventory file, you must create a file (e.g. /usr/local/etc/ansible/hosts) or any other file but with the proper formatting with the IP address or hostname of the remote host. 

An `ansible/hosts` file that has an entry for one server would be:
```sh
[servers]
172.16.174.137
```

Alternately, hosts may be specified on the command line (the comma is necessary even if there is only one host):
```
ansible-playbook -i /usr/local/etc/ansible/hosts, someplaybook.yaml
```

## opencr user (optional)

A example playbook is provided to show how to create a `opencr` user with sudo permissions using Ansible to be used with the host. 

Create the `opencr` user and gives it sudo access:
```sh
ansible-playbook -i /usr/local/etc/ansible/hosts user.yaml
```

## Prerequisites

Install prerequisites
```sh 
# for centos
ansible-playbook -i /usr/local/etc/ansible/hosts prep_centos.yaml
```

The prerequisites installation includes programs needed to build packages, node, java (Adopt OpenJDK distribution), and maven. The version of maven provided by yum is too out-of-date for builds.


## ElasticSearch

ElasticSearch is installed, a plugin is installed, and it is started and controlled by systemd. A verification is done to ensure its running.
```
ansible-playbook -i /usr/local/etc/ansible/hosts elasticsearch.yaml
```

## Postgres

This creates a hapi user, adds a user-entered password, and creates a hapi database.
```
ansible-playbook -i /usr/local/etc/ansible/hosts postgres.yaml
```

## HAPI

This is in-progress.

todo:
* hapi is not talking to postgres correctly
* hapi should be run by tomcat (which requires installation)

```
ansible-playbook -i /usr/local/etc/ansible/hosts hapi.yaml -e user=opencr
```


## OpenCR Service

This is completed but not useful until hapi is talking to postgres.


## Add additional user public keys

As necessary, add additional ssh keys to the user `opencr`. (Ensure that the user's public key is available on github, ie. https://github.com/citizenrich.keys):
```
ansible-playbook -i /usr/local/etc/ansible/hosts keys.yaml
```

