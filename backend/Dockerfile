FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

RUN apk add --no-cache docker-cli docker-cli-compose git

EXPOSE 5000

CMD ["npm", "start"]
