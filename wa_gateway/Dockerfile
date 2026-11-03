# WhatsApp gateway (Baileys) — serves WA session for the NMS backend.
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

# Baileys multi-file auth state persists on the 'wa-session' volume.
RUN mkdir -p /app/session
VOLUME ["/app/session"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["node", "index.js"]
