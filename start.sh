#!/usr/bin/env bash
# Salfanet NMS — Docker quick start.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.docker ]; then
    cp .env.docker.example .env.docker
    # Generate real secrets so the stack boots with sane defaults.
    SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    INTERNAL=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET/" .env.docker
    sed -i "s/^INTERNAL_API_KEY=.*/INTERNAL_API_KEY=$INTERNAL/" .env.docker
    echo "[start] Created .env.docker with generated secrets — review it before production use."
fi

docker compose --env-file .env.docker up -d --build "$@"

PORT=$(grep -E '^HTTP_PORT=' .env.docker | cut -d= -f2 | tr -d ' ')
echo "[start] Salfanet NMS is up → http://localhost:${PORT:-8080}"
