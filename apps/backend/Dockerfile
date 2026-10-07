FROM node:22-alpine AS build
WORKDIR /app
COPY apps/backend/package*.json ./
RUN npm install
COPY apps/backend/tsconfig.json apps/backend/nest-cli.json ./
COPY apps/backend/prisma ./prisma
COPY apps/backend/src ./src
COPY modeles_pdf ./modeles_pdf
RUN npm run prisma:generate
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /app/uploads

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/modeles_pdf ./modeles_pdf
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
