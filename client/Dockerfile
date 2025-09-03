FROM nginx:1.27-alpine
COPY set_worker_processes.sh /docker-entrypoint.d/
COPY build /usr/share/nginx/html
COPY nginx-default.conf /etc/nginx/conf.d/default.conf
