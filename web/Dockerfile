 # Web (Next.js) container
 FROM node:20-alpine AS deps
 WORKDIR /app
 COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
- RUN npm ci || yarn --frozen-lockfile || pnpm i --frozen-lockfile || npm i
+ # Install deps but skip postinstall (prepare:swc) until code exists
+ RUN npm ci --ignore-scripts \
+   || yarn --frozen-lockfile --ignore-scripts \
+   || pnpm i --frozen-lockfile --ignore-scripts \
+   || npm i --ignore-scripts
 
 FROM node:20-alpine AS builder
 WORKDIR /app
 COPY --from=deps /app/node_modules ./node_modules
 COPY . .
+ # Now scripts/ exists; run the SWC prep if present (no-op if missing)
+ RUN [ -f scripts/prepare-swc.cjs ] && node scripts/prepare-swc.cjs || true
 RUN npm run build || yarn build
 
 FROM node:20-alpine AS runner
 WORKDIR /app
 ENV NODE_ENV=production
 COPY --from=builder /app/public ./public
 COPY --from=builder /app/.next/standalone ./
 COPY --from=builder /app/.next/static ./.next/static
 EXPOSE 3000
 CMD ["node", "server.js"]
