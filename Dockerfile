FROM node:22-alpine

WORKDIR /app

COPY package.json server.mjs ./
COPY public ./public
COPY data ./data

ENV PORT=5173
ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["node", "server.mjs"]
