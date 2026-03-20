#include <iostream>      // cout, cerr
#include <thread>        // sleep
#include <chrono>        // time durations
#include <cstdlib>       // rand()
#include <cmath>         // pow() for backoff
#include <ctime>         // time(NULL)
#include <vector>        // store job list
#include <string>        // string operations

#include <pqxx/pqxx>             // Postgres library
#include <sw/redis++/redis++.h>  // Redis library

using namespace sw::redis;  // so we dont write sw::redis:: everywhere

int main() {
    try {

        // Connect to Redis - used as our job queue
        Redis redis("tcp://redis:6379");

        pqxx::connection* conn;

        // Keep retrying until Postgres is ready
        // Worker starts before Postgres in Docker, so we need this
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

        std::cout << "Worker started. Polling for jobs..." << std::endl;

        // Poll Redis every second forever
        while (true) {

            // Get current time as Unix timestamp
            // Jobs in Redis are stored with timestamp as score
            // so we fetch all jobs due at or before right now
            long now = time(NULL);
            std::string max_score = std::to_string(now);

            // Fetch all jobs from Redis with score between -inf and now
            // This gives us all jobs that are due to run
            auto reply = redis.command("ZRANGEBYSCORE", "job_queue", "-inf", max_score);

            // Parse Redis reply into a list of job IDs
            std::vector<std::string> jobs;
            if (reply && reply->type == REDIS_REPLY_ARRAY) {
                for (size_t i = 0; i < reply->elements; ++i) {
                    if (reply->element[i]->type == REDIS_REPLY_STRING) {
                        jobs.push_back(std::string(reply->element[i]->str, reply->element[i]->len));
                    }
                }
            }

            if (!jobs.empty()) {
                std::string job_id = jobs[0];

                // Remove from Redis immediately so no other worker picks it up
                redis.zrem("job_queue", job_id);

                std::cout << "Processing job: " << job_id << std::endl;

                try {
                    pqxx::work txn(*conn);

                    // Claim the job in Postgres - only succeeds if job is still 'queued'
                    // This prevents duplicate execution in a multi-worker setup
                    auto r = txn.exec_params(
                        "UPDATE jobs SET status='started', started_at=NOW() "
                        "WHERE id=$1 AND status='queued' "
                        "RETURNING retry_count, max_retries",
                        job_id
                    );

                    // If empty, another worker already claimed it - skip
                    if (r.empty()) {
                        std::cout << "Job already taken, skipping..." << std::endl;
                        txn.commit();
                        continue;
                    }

                    int retry_count = r[0]["retry_count"].as<int>();
                    int max_retries = r[0]["max_retries"].as<int>();

                    txn.commit();

                    std::cout << "Executing job..." << std::endl;

                    // Simulate actual work - in real world this would be
                    // sending an email, calling an API, processing an image etc.
                    bool success = false;
                    try {
                        std::this_thread::sleep_for(std::chrono::seconds(2));
                        success = true;
                    } catch (...) {
                        success = false;
                    }

                    pqxx::work txn2(*conn);

                    if (success) {
                        // Mark job as completed in Postgres and log the event
                        txn2.exec_params(
                            "UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=$1",
                            job_id
                        );
                        txn2.exec_params(
                            "INSERT INTO job_events (job_id, event, message) "
                            "VALUES ($1, 'COMPLETED', 'Job completed successfully')",
                            job_id
                        );
                        txn2.commit();
                        std::cout << "Job completed: " << job_id << std::endl;

                    } else {
                        std::cout << "Job failed: " << job_id << std::endl;

                        if (retry_count >= max_retries) {
                            // Max retries exceeded - move to Dead Letter Queue
                            // DLQ holds jobs that failed too many times for manual inspection
                            txn2.exec_params(
                                "UPDATE jobs SET status='dead', is_dead_letter=true WHERE id=$1",
                                job_id
                            );
                            txn2.exec_params(
                                "INSERT INTO job_events (job_id, event, message) "
                                "VALUES ($1, 'DEAD', 'Job moved to dead letter queue')",
                                job_id
                            );
                            txn2.commit();
                            redis.lpush("dlq_jobs", job_id);
                            std::cout << "Moved to dead letter queue: " << job_id << std::endl;

                        } else {
                            // Retry with exponential backoff + jitter
                            // Backoff: attempt 1 = 4s, attempt 2 = 8s, attempt 3 = 16s (max 30s)
                            // Jitter: adds randomness so multiple workers dont retry at same time
                            int attempt = retry_count + 1;
                            int delay = std::min((int)pow(2, attempt) * 2, 30);
                            float jitter = 0.8 + static_cast<float>(rand()) / RAND_MAX * (1.2 - 0.8);
                            delay = static_cast<int>(delay * jitter);
                            int next_time = time(NULL) + delay;

                            // Update retry count and reschedule in Redis with future timestamp
                            txn2.exec_params(
                                "UPDATE jobs SET retry_count=$1, status='retrying', "
                                "last_attempt_at=NOW() WHERE id=$2",
                                attempt, job_id
                            );
                            txn2.exec_params(
                                "INSERT INTO job_events (job_id, event, message) "
                                "VALUES ($1, 'RETRY', 'Job scheduled for retry')",
                                job_id
                            );
                            txn2.commit();
                            redis.zadd("job_queue", job_id, next_time);
                            std::cout << "Retry scheduled in " << delay << " seconds." << std::endl;
                        }
                    }

                } catch (const std::exception& e) {
                    std::cerr << "Error processing job " << job_id << ": " << e.what() << std::endl;
                }

            } else {
                // No jobs available - sleep 1 second before polling again
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        }

    } catch (const std::exception &e) {
        std::cerr << "Fatal worker error: " << e.what() << std::endl;
    }

    return 0;
}