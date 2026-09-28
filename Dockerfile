# Production image for the STUDIODO cloud API (server/). The kiosk itself is
# a separate Electron build (see `npm run dist`) — this image is only for the
# server that kiosks and the public gallery page talk to.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4050

# Runs pending Drizzle migrations before every start — safe to repeat, drizzle
# tracks which migrations already applied, so this keeps a redeploy from ever
# needing a manual "ssh in and run db:migrate" step.
CMD ["sh", "-c", "npm run db:migrate && node dist-server/index.js"]
