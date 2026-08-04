# syntax=docker/dockerfile:1.7
FROM node:22.16.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

FROM dependencies AS build
COPY tsconfig*.json nest-cli.json eslint.config.mjs .prettierrc ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.16.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 nodeapp \
    && useradd --system --uid 10001 --gid nodeapp --create-home nodeapp
COPY --from=build --chown=nodeapp:nodeapp /app/package.json ./package.json
COPY --from=build --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /app/dist ./dist
USER nodeapp
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
