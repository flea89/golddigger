
FROM node:lts-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /goldigger
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /goldigger
COPY --from=deps /goldigger/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production server
FROM base AS runner
WORKDIR /goldigger
ENV NODE_ENV=production
COPY --from=builder /goldigger/.next/standalone ./
COPY --from=builder /goldigger/.next/static ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
