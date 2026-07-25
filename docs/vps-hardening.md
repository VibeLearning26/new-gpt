# VibeGPT – Oracle Cloud VPS Hardening Runbook

Run these checks **on the VPS**. Commands are read-only unless marked
**MUTATING**. Never change SSH settings without a second tested session.

## 1. Identify the OS first (do not assume Ubuntu)

```bash
cat /etc/os-release
uname -a
```

Use apt/dnf/zypper equivalents for your distro below.

## 2. Updates

```bash
# Debian/Ubuntu:
sudo apt update && sudo apt -y upgrade          # MUTATING
sudo systemctl enable --now unattended-upgrades # MUTATING (auto security updates)
# Oracle Linux/RHEL:
sudo dnf -y update                              # MUTATING
sudo systemctl enable --now dnf-automatic-install.timer  # MUTATING
```

## 3. SSH target state

Verify current config (read-only):

```bash
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication|port'
```

Target: `PermitRootLogin no`, `PasswordAuthentication no`, `PubkeyAuthentication yes`.

**Lockout prevention before changing anything:**

1. Open a SECOND terminal, log in with your key, keep it open.
2. **MUTATING:**
   ```bash
   sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
   sudo sed -ri 's/^#?PermitRootLogin.*/PermitRootLogin no/; s/^#?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   sudo sshd -t && sudo systemctl reload sshd
   ```
3. Confirm a NEW key-based login works in a third terminal BEFORE closing the others.
4. Rollback if needed: `sudo cp /etc/ssh/sshd_config.bak.<date> /etc/ssh/sshd_config && sudo systemctl reload sshd`

Brute-force protection:

```bash
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban   # MUTATING (Debian)
```

## 4. Firewall (host layer)

Default-deny incoming; allow only SSH (restricted), 80, 443.

```bash
# Debian/Ubuntu (ufw):
sudo ufw default deny incoming            # MUTATING
sudo ufw default allow outgoing           # MUTATING
sudo ufw allow from <YOUR_TRUSTED_IP> to any port 22 proto tcp   # MUTATING (prefer IP-restricted SSH)
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp                  # MUTATING
sudo ufw enable                           # MUTATING
sudo ufw status verbose
# Oracle Linux (firewalld):
sudo firewall-cmd --permanent --add-service=http --add-service=https   # MUTATING
sudo firewall-cmd --reload                                              # MUTATING
```

## 5. Oracle Cloud network controls (console — cannot be scripted here)

- **Security List / NSG:** ingress only TCP 22 (restricted source), 80, 443.
  Remove any rule exposing 3000/8000/5432/11434/20128.
- Confirm the public IP is assigned only to the edge host.

A host firewall does NOT replace Oracle ingress rules — configure both.

## 6. Docker daemon

```bash
docker version && docker compose version
sudo ss -tulpn | grep -E '2375|2376' || echo "no docker TCP socket (good)"
sudo ls -l /var/run/docker.sock        # root:docker; only trusted users in docker group
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
```

The compose files publish only Caddy ports (80/443); verify nothing else is
host-reachable: `ss -tulpn` must show no 3000/8000/5432/11434/20128 on 0.0.0.0.

## 7. Swap (availability buffer for Ollama, ~6 GB RAM box)

```bash
swapon --show; free -h
# MUTATING (2 GB swap):
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10   # keep low; persist in /etc/sysctl.d/99-vibegpt.conf
```

Swap is an availability buffer, not a substitute for the container mem_limit
values in docker-compose.prod.yml / docker-compose.oracle.yml.

## 8. Time sync & disk

```bash
timedatectl status
df -h
```

## 9. Production secrets file

```bash
sudo install -m 600 -o root -g root /dev/null /opt/vibegpt/.env   # MUTATING
# fill from infrastructure/oracle.env.example; every placeholder replaced;
# APP_ENV=production (the API refuses default JWT/admin secrets in production)
```

## 10. Post-deploy verification

```bash
curl -I https://YOUR_DOMAIN                       # HSTS/CSP/nosniff present
curl -s http://YOUR_DOMAIN/api/v1/health          # via Caddy
curl -s http://PUBLIC_IP:11434/api/tags           # MUST fail (timeout/refused)
curl -s http://PUBLIC_IP:8000/api/v1/health       # MUST fail
curl -s http://PUBLIC_IP:5432                     # MUST fail
```
