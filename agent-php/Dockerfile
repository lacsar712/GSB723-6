FROM docker.m.daocloud.io/library/php:8.3-apache
WORKDIR /var/www/html
COPY . /var/www/html
RUN a2enmod headers rewrite
EXPOSE 80
