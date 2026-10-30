# Node 22: Vitest 5 won't run on 20. Keep in step with CI's frontend job.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
