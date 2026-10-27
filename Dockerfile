# October 2026 Node.js security fixes, including the bundled CA update.
FROM node:22.23.4-alpine

# OS clients use a separate CA store from Node's bundled certificates.
RUN apk add --no-cache --upgrade ca-certificates \
    && update-ca-certificates

WORKDIR /app

COPY . .

WORKDIR /app/server

RUN npm install --omit=dev

ENV PORT=4173

EXPOSE 4173

CMD ["node", "api-server.js"]
