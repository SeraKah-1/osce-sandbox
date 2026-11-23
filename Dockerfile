FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
COPY docs ./docs
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=4173 HOST=0.0.0.0 STUDIO_DATA=/app/data/studio.json
EXPOSE 4173
CMD ["node","server/index.js"]
