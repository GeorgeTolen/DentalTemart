FROM node:24-alpine
WORKDIR /app
# git нужен npm для зависимостей Baileys, которые ставятся из GitHub.
RUN apk add --no-cache git
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js ./
RUN mkdir -p /data/auth && chown -R node:node /data /app
USER node
ENV PORT=3001 AUTH_DIR=/data/auth
VOLUME /data/auth
EXPOSE 3001
CMD ["node", "index.js"]
