FROM node:22-alpine

# better-sqlite3 requires native build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY indexer/ ./indexer/

RUN mkdir -p /data

ENV INDEXER_DB_PATH=/data/khord.db
ENV FIREHOSE_RELAY=wss://bsky.network

CMD ["node", "indexer/index.js"]
