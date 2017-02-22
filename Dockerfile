FROM node

MAINTAINER Reekoh

WORKDIR /home

# copy files
ADD . /home

# Update the repository sources list once more
RUN sudo apt-get update && apt-get install -y \
    postgresql-client-9.4 \
    libpq-dev

# install package.json dependencies
RUN npm install

# setting need environment variables
ENV INPUT_PIPE="demo.pipe.storage" \
    CONFIG="{}" \
    LOGGERS="" \
    EXCEPTION_LOGGERS="" \
    BROKER="amqp://guest:guest@172.17.0.2/"

CMD ["node", "app"]