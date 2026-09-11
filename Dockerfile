# The attested-fetch worker only (D27), built by Railway from this file. The web app is on Vercel and
# never uses it. Node 24 on Debian (glibc) so zk-fetch's native TEE client and FFI bindings load.
FROM node:24-slim
# The TEE client is Go code: it verifies TLS against the system CA store, which the slim image lacks
# ("x509: certificate signed by unknown authority" on tee.reclaimprotocol.org, 11 Sep 2026).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
CMD ["pnpm", "zkfetch:worker"]
