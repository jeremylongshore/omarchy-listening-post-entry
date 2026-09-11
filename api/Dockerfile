FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY packages/perception-contract /packages/perception-contract
COPY api/package*.json ./
RUN npm ci --no-audit --no-fund
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8790 DATABASE_PATH=/data/perception.db
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /packages/perception-contract /packages/perception-contract
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8790
CMD ["node", "dist/server.js"]
