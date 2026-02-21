FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm install --omit=dev --ignore-scripts \
    && npx playwright install chromium --with-deps \
    && npm cache clean --force

COPY --chown=myuser . ./

CMD ["node", ".actor/main.js"]
