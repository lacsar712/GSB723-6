FROM docker.m.daocloud.io/library/node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install
COPY . .
EXPOSE 8006
CMD ["node", "src/app.js"]
