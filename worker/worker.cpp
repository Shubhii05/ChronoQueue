#include <iostream>
#include <thread>
#include <chrono>
#include <cstdlib>
#include <cmath>
#include <ctime>
#include <vector>
#include <string>
#include <unistd.h>

#include <pqxx/pqxx>
#include <sw/redis++/redis++.h>

using namespace sw::redis;

bool simulate_job(const std::string& type) {        //it shows the fake time execution 
    if (type == "email")
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    else if (type == "payment")
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    else if (type == "video_processing")
        std::this_thread::sleep_for(std::chrono::seconds(3));
    else if (type == "notification")
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    else if (type == "report")
        std::this_thread::sleep_for(std::chrono::seconds(5));
    else
        std::this_thread::sleep_for(std::chrono::seconds(1));

    return (rand() % 10) < 8;
}

int main() {
    srand(time(NULL));

    try {
        Redis redis("tcp://redis:6379");

        pqxx::connection* conn;
        while (true) {
            try {
                conn = new pqxx::connection(
                    "dbname=taskqueue user=admin password=password host=postgres port=5432"
                );
                if (conn->is_open()) {
                    std::cout << "Connected to Postgres" << std::endl;
                    break;
                }
            } catch (...) {
                std::cout << "Waiting for Postgres..." << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
            }
        }

        const char* configured_name = std::getenv("WORKER_NAME");
        std::string worker_name = configured_name && std::string(configured_name).size() > 0
            ? std::string(configured_name)
            : "worker_" + std::to_string(getpid());
        std::string worker_id;

        {
            pqxx::work reg(*conn);
            reg.exec_params(
                "UPDATE workers SET status='dead' WHERE name=$1",
                worker_name
            );
            auto r = reg.exec_params(
                "INSERT INTO workers (name, status, last_heartbeat) "
                "VALUES ($1, 'alive', NOW()) "
                "RETURNING id",
                worker_name
            );
            worker_id = r[0]["id"].as<std::string>();
            reg.commit();
        }

        std::cout << "Registered worker: " << worker_name << " (" << worker_id << ")" << std::endl;

        std::thread heartbeat([&]() {
            while (true) {
                std::this_thread::sleep_for(std::chrono::seconds(5));
                try {
                    pqxx::work hb(*conn);
                    hb.exec_params(
                        "UPDATE workers SET last_heartbeat=NOW(), status='alive' WHERE id=$1",
                        worker_id
                    );
                    hb.commit();
                } catch (const std::exception& e) {
                    std::cerr << "Heartbeat error: " << e.what() << std::endl;
                }
            }
        });
        heartbeat.detach();

        std::cout << "Polling for jobs..." << std::endl;

        while (true) {
            auto reply = redis.command("ZPOPMIN", "job_queue", "1");

            std::string job_id;
            if (reply && reply->type == REDIS_REPLY_ARRAY && reply->elements >= 2) {
                if (reply->element[0]->type == REDIS_REPLY_STRING) {
                    job_id = std::string(
                        reply->element[0]->str,
                        reply->element[0]->len
                    );
                }
            }

            if (!job_id.empty()) {
                std::cout << "[" << worker_name << "] Picked: " << job_id << std::endl;

                try {
                    pqxx::work txn(*conn);
                    auto r = txn.exec_params(
                        "UPDATE jobs SET status='started', started_at=NOW(), worker_id=$2 "
                        "WHERE id=$1 AND status IN ('queued','retrying') "
                        "RETURNING retry_count, max_retries, type",
                        job_id, worker_id
                    );

                    if (r.empty()) {
                        txn.commit();
                        continue;
                    }

                    int retry_count         = r[0]["retry_count"].as<int>();
                    int max_retries         = r[0]["max_retries"].as<int>();
                    std::string type        = r[0]["type"].as<std::string>();

                    txn.exec_params(
                        "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'STARTED', $2)",
                        job_id, "Started by " + worker_name
                    );
                    txn.commit();

                    std::cout << "[" << worker_name << "] Running " << type
                              << " (attempt " << retry_count + 1 << ")" << std::endl;

                    bool success = simulate_job(type);

                    pqxx::work txn2(*conn);

                    if (success) {
                        txn2.exec_params(
                            "UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=$1",
                            job_id
                        );
                        txn2.exec_params(
                            "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'COMPLETED', 'Job completed successfully')",
                            job_id
                        );
                        txn2.exec_params(
                            "UPDATE workers SET jobs_processed = jobs_processed + 1 WHERE id=$1",
                            worker_id
                        );
                        txn2.commit();
                        std::cout << "[" << worker_name << "] Completed: " << job_id << std::endl;

                    } else {
                        if (retry_count >= max_retries) {
                            txn2.exec_params(
                                "UPDATE jobs SET status='dead', is_dead_letter=true WHERE id=$1",
                                job_id
                            );
                            txn2.exec_params(
                                "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'DEAD', 'Moved to dead letter queue')",
                                job_id
                            );
                            txn2.commit();
                            redis.lpush("dlq_jobs", job_id);
                            std::cout << "[" << worker_name << "] DLQ: " << job_id << std::endl;

                        } else {
                            int attempt  = retry_count + 1;
                            int delay    = std::min((int)pow(2, attempt) * 2, 30);
                            float jitter = 0.8f + static_cast<float>(rand()) / RAND_MAX * 0.4f;
                            delay        = static_cast<int>(delay * jitter);
                            long next_time = time(NULL) + delay;

                            txn2.exec_params(
                                "UPDATE jobs SET retry_count=$1, status='retrying', last_attempt_at=NOW() WHERE id=$2",
                                attempt, job_id
                            );
                            txn2.exec_params(
                                "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'RETRY', $2)",
                                job_id,
                                "Retry " + std::to_string(attempt) + "/" + std::to_string(max_retries) + " in " + std::to_string(delay) + "s"
                            );
                            txn2.commit();
                            redis.zadd("job_queue", job_id, (double)next_time);
                            std::cout << "[" << worker_name << "] Retry in " << delay << "s" << std::endl;
                        }
                    }

                } catch (const std::exception& e) {
                    std::cerr << "Job error: " << e.what() << std::endl;
                }

            } else {
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        }

    } catch (const std::exception& e) {
        std::cerr << "Fatal: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
