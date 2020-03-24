# Ansible

> This is incomplete and a work in-progress.

# Ansible

You must have a local VM or remote server. See `/packaging` for a Vagrant VM (CentOS 7) script for working example of creating a local VM.

> These steps are for installing on a server OS directly and require experience with remote configuration.

To use Ansible, your SSH public key should be in `.ssh/authorized_keys` on the remote host and you must also create an /etc/ansible/hosts or similar with the IP address or hostname of the remote host. An `ansible/hosts` file that has an entry for localhost and one server would be:

```sh
[local]
localhost ansible_connection=local

[servers]
172.16.174.137
```

## SSH setup

A example playbook is provided to show how to create a `opencr` user with sudo permissions using Ansible to be used with VM. 

Create a VM. Make sure to include a public ssh key for the user who will install prerequisites.

Create the `opencr` user and gives it sudo access:
```sh
ansible-playbook -i /usr/local/etc/ansible/hosts user.yaml
```

As necessary, add additional ssh keys to the user `opencr`. (Ensure that the user's public key is available on github, ie. https://github.com/citizenrich.keys):
```
ansible-playbook -i /usr/local/etc/ansible/hosts keys.yaml
```

## Installation

Prerequisites
```sh 
# for centos
ansible-playbook -i /usr/local/etc/ansible/hosts prep_centos.yaml
```

> This ends the example. It is a work-in-progress and will be migrated to the docs when completed and tested.