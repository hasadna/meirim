#!/bin/sh

set -euo pipefail

WORKER_PROCESSES=${WORKER_PROCESSES:-2}

echo "Setting Nginx worker_processes to $WORKER_PROCESSES"
sed -i 's|worker_processes  auto|worker_processes '$WORKER_PROCESSES'|' /etc/nginx/nginx.conf
