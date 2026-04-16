# Interwall ui-v2 — multi-stage build.
# Stage 1 bundles the Vite app; stage 2 is nginx:alpine serving the static bundle.
# The nginx server config itself is NOT baked in here — docker-compose mounts
# /Users/ottogen/interwall/nginx/nginx.conf onto /etc/nginx/conf.d/default.conf
# so SPA fallback + /api proxy stay configurable without rebuilding the image.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
