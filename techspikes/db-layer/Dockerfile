
FROM node:lts-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /golddigger
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /golddigger
COPY --from=deps /golddigger/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production server
FROM base AS runner
WORKDIR /golddigger
ENV NODE_ENV=production
COPY --from=builder /golddigger/.next/standalone ./
COPY --from=builder /golddigger/.next/static ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
