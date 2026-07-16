FROM node:22-bookworm-slim

WORKDIR /app

ARG BASE_PATH=/
ARG VITE_API_BASE_URL
ARG VITE_PRIVY_APP_ID
ENV BASE_PATH=$BASE_PATH
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID

# Keep the image predictable for native dependency installs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json .npmrc ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY .env.example ./.env.example
COPY .gitattributes ./.gitattributes
COPY .gitignore ./.gitignore

RUN corepack enable \
  && CI=true pnpm install --no-frozen-lockfile \
  && CI=true pnpm run build

ENV NODE_ENV=production

CMD ["pnpm", "run", "start"]
