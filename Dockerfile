FROM node:22-bookworm-slim AS build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=build /app/client/dist /app/client/dist
COPY ["tháng 1.xlsx", "/app/tháng 1.xlsx"]
ENV NODE_ENV=production RENDER_READ_ONLY=true DB_PATH=/tmp/hoachtoan-test/hoachtoan.db GROUP_ALLOCATIONS_PATH=/tmp/hoachtoan-test/group_allocations.json EXCEL_PATH="/app/tháng 1.xlsx"
CMD ["sh", "-c", "node src/scripts/initRenderTest.js && exec node src/index.js"]
