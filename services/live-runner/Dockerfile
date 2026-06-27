# Build from the monorepo root: docker build -f services/live-runner/Dockerfile .
FROM node:20-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /repo/services/live-runner
CMD ["pnpm", "start"]
