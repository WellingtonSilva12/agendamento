# Usa uma imagem oficial e leve do Nginx como base
FROM nginx:1.25-alpine

# Remove a configuração padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia a nossa configuração personalizada do Nginx para o local correto dentro do contentor
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os ficheiros estáticos do frontend (HTML, CSS, JS, imagens) para a pasta que o Nginx serve
COPY . /usr/share/nginx/html

# Expõe a porta 80, que é a porta padrão do HTTP
EXPOSE 80

# O comando para iniciar o Nginx já está incluído na imagem base, não é preciso redefinir.
