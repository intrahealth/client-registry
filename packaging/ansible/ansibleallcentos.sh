#!/usr/bin/env bash
set -ex

# --forks 1 to stop hosts checking on first run: https://github.com/ansible/ansible/issues/25068
ansible-playbook -i /usr/local/etc/ansible/hosts user.yaml --forks 1
ansible-playbook -i /usr/local/etc/ansible/hosts prep_centos.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts elasticsearch.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts postgres.yaml -e user=opencr
ansible-playbook -i /usr/local/etc/ansible/hosts hapifhir.yaml -e user=opencr
# ansible-playbook -i /usr/local/etc/ansible/hosts install.yaml -e user=opencr
# ansible-playbook -i /usr/local/etc/ansible/hosts services.yaml -e user=opencr
# ansible-playbook -i /usr/local/etc/ansible/hosts troubleshoot.yaml -e user=opencr
 