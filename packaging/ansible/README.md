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
ansible-playbook -i 172.16.168.158, someplaybook.yaml
```

## opencr user (optional)

A example playbook is provided to show how to create a `opencr` user with sudo permissions using Ansible to be used with the host. 

Create the `opencr` user and gives it sudo access:
```sh
ansible-playbook -i /usr/local/etc/ansible/hosts user.yaml
```

## Installation

```sh 
ansible-playbook -i /usr/local/etc/ansible/hosts prep_centos.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts elasticsearch.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts tomcat.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts postgres.yaml -e user=opencr -e pgpass=hapi
ansible-playbook -i /usr/local/etc/ansible/hosts hapi.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts opencr.yaml -e user=opencr
```

Visit: https://ipaddress:3000/crux

HTTPS must be used.


## Add additional user public keys

As necessary, add additional ssh keys to the user `opencr`. (Ensure that the user's public key is available on github, ie. https://github.com/citizenrich.keys):
```
ansible-playbook -i /usr/local/etc/ansible/hosts keys.yaml
```