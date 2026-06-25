FROM node:22-alpine

WORKDIR /app

COPY . .

WORKDIR /app/server

RUN npm install --omit=dev

ENV PORT=4173

EXPOSE 4173

CMD ["node", "api-server.js"]
