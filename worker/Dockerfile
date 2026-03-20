#dockerfile is like a recipe which allows to run same code everywhere


#start from ubuntu os as a base
FROM ubuntu:22.04

#install all required tools and libraries
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libhiredis-dev \
    libpqxx-dev \
    libpq-dev \
    curl


# set working directory in container
WORKDIR /app

# 🔥 Install redis++
RUN git clone https://github.com/sewenew/redis-plus-plus.git && \
    cd redis-plus-plus && \
    mkdir build && cd build && \
    cmake .. && \
    make && \
    make install

ENV LD_LIBRARY_PATH=/usr/local/lib
# copy code in container
COPY . .

# 🔥 Compile worker
RUN g++ worker.cpp -o worker \
    -std=c++17 \
    -lredis++ \
    -lhiredis \
    -lpqxx \
    -lpq

#run the worker when container starts
CMD ["./worker"]