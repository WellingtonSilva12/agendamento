# Usa uma imagem oficial do Node.js como base. A versão Alpine é leve.
FROM node:20-alpine

# Define o diretório de trabalho dentro do contentor
WORKDIR /usr/src/app

# Copia os ficheiros de dependências de forma explícita.
COPY package.json package-lock.json ./

# --- PASSO DE DEPURAÇÃO ---
# Lista os ficheiros no diretório de trabalho para confirmar que a cópia funcionou.
# Você pode remover esta linha depois que o build funcionar.
RUN ls -la

# Instala as dependências da aplicação
RUN npm install

# Copia o resto do código da aplicação para o diretório de trabalho
COPY . .

# Expõe a porta 5000 para que a aplicação possa ser acedida
EXPOSE 5000

# Comando para iniciar a aplicação quando o contentor arrancar
CMD [ "npm", "start" ]
