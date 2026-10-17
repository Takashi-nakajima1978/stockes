FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache poppler-utils

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund --no-audit
COPY server.mjs refresh-control.mjs surge-forecast.mjs edinet-financials.mjs edinet-documents.mjs earnings-analysis.mjs portfolio-insights.mjs ./
COPY backup.mjs data-store.mjs response-cache.mjs investment-evidence.mjs forecast-history.mjs savings-forecast.mjs ./
COPY public ./public
COPY data ./data

ENV PORT=5173
ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["node", "server.mjs"]
