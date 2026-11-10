FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY demo ./demo
COPY server ./server
COPY vite.config.ts tsconfig.json ./
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 AGENTONE_DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY output/connector/agentone-home-connector-raspberry.zip ./downloads/agentone-home-connector-raspberry.zip
COPY output/connector/agentone-home-connector-raspberry.zip.sig ./downloads/agentone-home-connector-raspberry.zip.sig
COPY output/connector/home-connector-release.json ./downloads/home-connector-release.json
COPY output/connector/agentone-siri-shortcuts.zip ./downloads/agentone-siri-shortcuts.zip
COPY output/connector/agentone-apple-companion.zip ./downloads/agentone-apple-companion.zip
COPY output/connector/AgentOne-Companion-unsigned.ipa ./downloads/AgentOne-Companion-unsigned.ipa
COPY output/connector/AgentOne-Companion-unsigned.ipa.sha256 ./downloads/AgentOne-Companion-unsigned.ipa.sha256
COPY docs/IPHONE-SIDELOAD.md ./downloads/iphone-sideload.md
COPY docs/OPENCLAW-PLUGIN-ONBOARDING.md ./downloads/openclaw-plugin-onboarding.md
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 4173
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:4173/api/health >/dev/null || exit 1
CMD ["node","server/demo-server.mjs"]
