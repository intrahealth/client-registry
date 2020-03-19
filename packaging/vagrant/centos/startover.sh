#!/usr/bin/env bash
set -ex

# this is a utility script, do not use
vagrant halt || true
vagrant destroy --force || true
vagrant up || true
vagrant ssh -c 'ip address'