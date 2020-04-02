#!/usr/bin/env bash
set -ex

# assumes an inventory file at /usr/local/etc/ansible/hosts and opencr user with sudo, and insecure pass for pg db

# --forks 1 to stop hosts checking on first run: https://github.com/ansible/ansible/issues/25068
ansible-playbook -i /usr/local/etc/ansible/hosts user.yaml --forks 1
ansible-playbook -i /usr/local/etc/ansible/hosts prep_centos.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts elasticsearch.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts tomcat.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts postgres.yaml -e user=opencr -e pgpass=hapi
ansible-playbook -i /usr/local/etc/ansible/hosts hapi.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts opencr.yaml -e user=opencr
# ansible-playbook -i /usr/local/etc/ansible/hosts troubleshoot.yaml -e user=opencr
 