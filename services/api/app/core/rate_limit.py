"""Shared API rate limiter configuration.

Proxy-aware client identification: when the socket peer is a trusted
reverse proxy (Caddy, loopback, private Docker networks), the real client
IP is taken from X-Forwarded-For. Public peers are never trusted, so an
internet client cannot spoof its rate-limit key with a forged header.
The default SlowAPI 429 handler supplies the Retry-After header.
"""

import ipaddress
from functools import lru_cache

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings


@lru_cache
def _trusted_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    networks = []
    for item in get_settings().TRUSTED_PROXIES.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            networks.append(ipaddress.ip_network(item, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def client_key(request: Request) -> str:
    """Best-effort real client IP for rate limiting."""
    peer = request.client.host if request.client else "unknown"
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return peer

    if any(peer_ip in network for network in _trusted_networks()):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip() or peer
    return peer


limiter = Limiter(key_func=client_key)
