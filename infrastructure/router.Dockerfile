FROM node:22-bookworm-slim

# OmniRoute includes better-sqlite3. Keep its native build tools in this image
# so the service can be installed once at build time instead of retrying on
# every container start.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g --no-audit --no-fund omniroute@3

EXPOSE 20128

CMD ["omniroute", "serve", "--no-open"]
