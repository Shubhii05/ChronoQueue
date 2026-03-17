#include <iostream>
#include <thread>
#include <chrono>
#include <sw/redis++/redis++.h>

using namespace sw::redis;

int main() {
    try {
        Redis redis("tcp://127.0.0.1:6379");

        std::cout << "Worker started. Waiting for jobs...\n";

        while (true) {
            auto result = redis.zpopmax("job_queue");

            if (result) {
                auto job = *result;

                std::string job_data = job.first;
                int priority = job.second;

                std::cout << "Processing Job: " << job_data << std::endl;
                std::cout << "Priority: " << priority << std::endl;

                std::this_thread::sleep_for(std::chrono::seconds(2));N

                std::cout << "Job completed\n\n";
            } else {
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        }

    } catch (const Error &e) {
        std::cerr << "Redis error: " << e.what() << std::endl;
    }

    return 0;
}