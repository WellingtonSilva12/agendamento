# Estágio de produção (imagem final leve)
FROM nginx:1.25-alpine

# 1. Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# 2. Copia configuração customizada
COPY nginx.conf /etc/nginx/conf.d/

# 3. Copia arquivos estáticos (HTML, CSS, JS, imagens)
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY notebook.png /usr/share/nginx/html/

# 4. Configura permissões (opcional, para garantir acesso)
RUN chmod -R 755 /usr/share/nginx/html

# 5. Expõe a porta 80 (HTTP)
EXPOSE 8089

# Comando padrão da imagem Nginx já inicia o servidor automaticamente