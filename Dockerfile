FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV PORT=3000 DB_PATH=/data/parcelas_master.sqlite
RUN mkdir -p /data && cp db/parcelas_master.sqlite /data/
EXPOSE 3000
CMD ["node", "server.js"]
