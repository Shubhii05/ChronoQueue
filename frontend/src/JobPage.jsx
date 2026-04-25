import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJob } from "./api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function JobPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const hasValidJobId = Boolean(id) && UUID_PATTERN.test(id);

  useEffect(() => {
    if (!hasValidJobId) return;

    const fetchJob = async () => {
      try {
        setError("");
        const res = await getJob(id);
        console.log("JOB DATA:", res.data); // debug
        setJob(res.data);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.error || "Failed to fetch job");
      }
    };

    fetchJob();

    const interval = setInterval(fetchJob, 2500);
    return () => clearInterval(interval);
  }, [hasValidJobId, id]);

  if (!id) return <p>Missing job ID.</p>;
  if (!hasValidJobId) return <p>Invalid job ID.</p>;
  if (error && !job) return <p>{error}</p>;
  if (!job) return <p>Loading...</p>;

  return (
    <div style={{ padding: 40 }}>
      <h2>Job Details: {id}</h2>

      <p>Status: {job.status}</p>

      <h3>Events:</h3>
      {job.events && job.events.length > 0 ? (
        job.events.map((e, i) => (
          <p key={i}>
            {e.event} - {e.message}
          </p>
        ))
      ) : (
        <p>No events yet</p>
      )}
    </div>
  );
}
