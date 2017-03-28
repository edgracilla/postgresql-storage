FROM node:boron

MAINTAINER Reekoh

RUN apt-get update && apt-get install -y build-essential
RUN apt-get install postgresql-client-9.4 libpq-dev -y

RUN mkdir -p /home/node/postgresql-storage
COPY . /home/node/postgresql-storage

WORKDIR /home/node/postgresql-storage

# Install dependencies
RUN npm install pm2 yarn -g
RUN yarn install

CMD ["pm2-docker", "--json", "app.yml"]