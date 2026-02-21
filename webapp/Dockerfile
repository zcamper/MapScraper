FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install chromium --with-deps

COPY src/ ./src/
COPY webapp/ ./webapp/

EXPOSE 3001

CMD ["node", "webapp/server.js"]
