FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install chromium --with-deps

COPY src/ ./src/
COPY api/ ./api/
COPY .env.example ./.env.example

EXPOSE 3000

CMD ["node", "api/server.js"]
