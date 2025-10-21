# Web (Next.js) container
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
# Install deps but skip postinstall until code exists
RUN npm ci --ignore-scripts \
  || yarn --frozen-lockfile --ignore-scripts \
  || pnpm i --frozen-lockfile --ignore-scripts \
  || npm i --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Run SWC prep if present (supports scripts/ or web/scripts/)
RUN if [ -f scripts/prepare-swc.cjs ]; then node scripts/prepare-swc.cjs; \
    elif [ -f web/scripts/prepare-swc.cjs ]; then node web/scripts/prepare-swc.cjs; \
    else echo "prepare-swc.cjs not found, skipping"; fi
RUN npm run build || yarn build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
