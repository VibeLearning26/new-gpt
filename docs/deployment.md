# Deployment Guide

VibeGPT supports two production topologies:

## A. Hybrid cloud (recommended — free-first, live deployment)

Frontend on **Cloudflare Pages**, API gateway on a **Cloudflare Worker** route
(`/api/*` on the same domain), FastAPI + worker + Ollama on the **Oracle Cloud
Free Tier VPS** reached through an outbound-only **Cloudflare Tunnel**, with
**Supabase PostgreSQL (pgvector) + Storage**. No frontend, animation, or RAG
changes — the same-origin routing keeps the existing auth cookie flow intact.

Full step-by-step runbook: [`../infrastructure/cloudflare/DEPLOYMENT.md`](../infrastructure/cloudflare/DEPLOYMENT.md).

## B. Single VPS (Oracle Cloud, Caddy as public entry point)

VibeGPT runs entirely on an Oracle Cloud VPS (ARM64 architecture) using Docker Compose.

### 1. Prerequisites

- Oracle Cloud Free Tier VPS (Ampere A1 Compute, 4 OCPUs, 24GB RAM recommended for local Ollama)
- Ubuntu 22.04 or later
- Docker & Docker Compose plugin installed
- Domain name pointing to your VPS IP

## 2. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Deployment

1. Clone the repository to `/opt/vibegpt`
2. Copy `.env.example` to `.env` and configure your secure passwords and domain
3. Update `Caddyfile` with your domain (e.g., `vibegpt.yourdomain.com`)
4. Build and start:

```bash
cd /opt/vibegpt/infrastructure
docker compose -f docker-compose.prod.yml up -d
```

## 4. Maintenance

Use the provided scripts in `infrastructure/scripts/`:

- `./backup.sh`: Creates a gzipped SQL dump of the database
- `./restore.sh <file>`: Restores a database backup
- `./health-check.sh`: Verifies all services are running
- `./deploy.sh`: Pulls latest code and rebuilds safely
