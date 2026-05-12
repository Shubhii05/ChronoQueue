#include <sw/redis++/redis++.h>
#include <pqxx/pqxx>
#include <iostream>
#include <thread>
#include <chrono>
#include <cstdlib>

using namespace sw::redis;

int main() {
    try {
        // ================================
        // 🔧 ENV VARIABLES
        // ================================
        const char* redis_env = std::getenv("REDIS_URL");
        const char* db_env    = std::getenv("DATABASE_URL");
        const char* name_env  = std::getenv("WORKER_NAME");

        if (!redis_env || !db_env) {
            std::cerr << "❌ Missing REDIS_URL or DATABASE_URL" << std::endl;
            return 1;
        }

        std::string redis_url = redis_env;
        std::string db_url    = db_env;
        std::string worker_name = name_env ? name_env : "worker_default";

        // ================================
        // 🔗 CONNECT REDIS
        // ================================
        Redis redis(redis_url);
        std::cout << "✅ Connected to Redis" << std::endl;

        // ================================
        // 🔗 CONNECT POSTGRES
        // ================================
        pqxx::connection conn(db_url);
        std::cout << "✅ Connected to Postgres" << std::endl;

        // ================================
        // 🧠 REGISTER WORKER
        // ================================
        pqxx::work txn(conn);

        pqxx::result res = txn.exec_params(
            "INSERT INTO workers (name, status, last_heartbeat) VALUES ($1, 'alive', NOW()) RETURNING id",
            worker_name
        );

        std::string worker_id = res[0][0].c_str();
        txn.commit();

        std::cout << "🟢 Worker started: " << worker_name << " (ID: " << worker_id << ")" << std::endl;

        // ================================
        // 🔁 MAIN LOOP
        // ================================
        while (true) {

            try {
                // ----------------------------
                // 💓 HEARTBEAT
                // ----------------------------
                {
                    pqxx::work hb(conn);
                    hb.exec_params(
                        "UPDATE workers SET last_heartbeat = NOW() WHERE id = $1",
                        worker_id
                    );
                    hb.commit();
                }

                // ----------------------------
                // 📥 FETCH JOB (ATOMIC)
                // ----------------------------
                auto result = redis.zpopmin("job_queue");

if (result) {
    std::string job_id = result->first;

                    // ----------------------------
                    // 🟡 MARK JOB STARTED
                    // ----------------------------
                    {
                        pqxx::work txn(conn);
                        txn.exec_params(
                            "UPDATE jobs SET status='started', worker_id=$1, started_at=NOW() WHERE id=$2",
                            worker_id,
                            job_id
                        );
                        txn.commit();
                    }

                    // ----------------------------
                    // ⏳ SIMULATE WORK
                    // ----------------------------
                    std::this_thread::sleep_for(std::chrono::seconds(3));

                    // ----------------------------
                    // 🟢 MARK JOB COMPLETE
                    // ----------------------------
                    {
                        pqxx::work txn(conn);
                        txn.exec_params(
                            "UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=$1",
                            job_id
                        );

                        txn.exec_params(
                            "UPDATE workers SET jobs_processed = jobs_processed + 1 WHERE id=$1",
                            worker_id
                        );

                        txn.commit();
                    }

                    std::cout << "✅ Completed job: " << job_id << std::endl;
                } else {
                    // No jobs → wait
                    std::this_thread::sleep_for(std::chrono::seconds(1));
                }

            } catch (const std::exception &e) {
                std::cerr << "⚠️ Worker loop error: " << e.what() << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
            }
        }

    } catch (const std::exception &e) {
        std::cerr << "❌ Fatal error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}