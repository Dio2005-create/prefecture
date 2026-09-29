FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run prisma:generate
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /app/uploads
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "start"]
