# syntax=docker/dockerfile:1

# Install the exact dependency graph recorded in package-lock.json. Development
# dependencies remain available in this stage because the NestJS compiler is
# required to produce the JavaScript runtime artifact.
FROM node:22.16.0-bookworm-slim AS dependencies

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

WORKDIR /build

# Copy package manifests before source code so npm installation remains cached
# when only application files change.
COPY package.json package-lock.json ./

RUN npm ci


FROM dependencies AS builder

# Copy only files required by the production build.
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build \
    && npm prune --omit=dev


FROM node:22.16.0-bookworm-slim AS runtime

ENV APP_HOME=/app \
    NODE_ENV=production \
    PORT=3000

WORKDIR ${APP_HOME}

# Run with a stable unprivileged UID/GID. The API does not need database
# administration rights, root filesystem ownership, or privileged ports.
RUN groupadd --system --gid 10001 appgroup \
    && useradd --system --uid 10001 --gid appgroup --create-home \
        --home-dir /home/appuser --shell /usr/sbin/nologin appuser

# Copy only compiled code and production dependencies into the runtime image.
COPY --from=builder --chown=appuser:appgroup /build/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /build/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /build/dist ./dist

USER appuser

EXPOSE 3000

# Node.js 22 provides fetch(), so the liveness probe needs no extra package.
# This endpoint checks only the API process, not PostgreSQL or object storage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "const port=process.env.PORT||'3000';fetch('http://127.0.0.1:'+port+'/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# NestJS receives SIGTERM directly and can run its enabled shutdown hooks.
STOPSIGNAL SIGTERM

CMD ["node", "dist/main.js"]
