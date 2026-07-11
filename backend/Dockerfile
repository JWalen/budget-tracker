# --- Build stage: compile TypeScript with full dev dependencies ---------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

# --- Runtime stage: minimal, non-root, production-only deps --------------------
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Only the pruned production node_modules and compiled output ship to runtime.
# No docker-cli/git (removed with the old self-update path), no dev toolchain.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Writable dirs owned by the non-root runtime user (logs + local uploads/backups).
# Without these, file logging and local-storage writes fail under USER node.
RUN mkdir -p /app/logs /app/uploads /backups \
    && chown -R node:node /app/logs /app/uploads /backups

# Drop root — run as the unprivileged built-in `node` user.
USER node

EXPOSE 5000

# Exec-form node (not `npm start`) so PID 1 receives SIGTERM directly and the
# graceful-shutdown handler in dist/index.js actually fires on deploy.
CMD ["node", "dist/index.js"]
