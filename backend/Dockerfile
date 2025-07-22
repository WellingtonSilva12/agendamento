# Estágio de construção
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copia apenas os arquivos necessários para instalação de dependências
COPY package.json package-lock.json ./

# Instala as dependências de produção (remove devDependencies)
RUN npm ci --only=production

# Estágio final (imagem menor)
FROM node:20-alpine

WORKDIR /usr/src/app

# Copia apenas o necessário da etapa de construção
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .

# Limpeza (opcional)
RUN rm -rf .dockerignore .gitignore

EXPOSE 5000

# Usa npm start ou diretamente o node se souber o arquivo de entrada
CMD [ "npm", "start" ]