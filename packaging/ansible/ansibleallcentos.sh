# assumes an inventory file at ./hosts and opencr user with sudo, and insecure pass for pg db

# --forks 1 to stop hosts checking on first run: https://github.com/ansible/ansible/issues/25068
ansible-playbook -i hosts user.yaml --forks 1
ansible-playbook -i hosts prep_centos.yaml -e user=opencr
ansible-playbook -i hosts elasticsearch.yaml -e user=opencr
ansible-playbook -i hosts tomcat.yaml -e user=opencr
ansible-playbook -i hosts postgres.yaml -e user=opencr -e pgpass=hapi
ansible-playbook -i hosts hapi.yaml -e user=opencr
ansible-playbook -i hosts opencr.yaml -e user=opencr
# ansible-playbook -i /usr/local/etc/ansible/hosts troubleshoot.yaml -e user=opencr
 