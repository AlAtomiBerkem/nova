FROM nginx:1.27-alpine

# своя конфигурация: раздача статики + проксирование /api на backend
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

# исходные файлы могут прийти с режимом 600 — делаем читаемыми для nginx-воркера
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80
