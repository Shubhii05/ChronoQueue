import { useState } from "react";
import { getJobIdFromResponse, uploadVideo } from "./api";
import { useNavigate } from "react-router-dom";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file || isUploading) return;

    try {
      setIsUploading(true);
      setError("");

      const res = await uploadVideo(file);

      console.log("UPLOAD RESPONSE:", res.data); // debug
      const normalizedJobId = getJobIdFromResponse(res.data);

      if (!normalizedJobId) {
        throw new Error("Upload succeeded but no job ID was returned");
      }

      navigate(`/job/${normalizedJobId}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Upload Video</h2>

      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          setFile(e.target.files[0] || null);
          setError("");
        }}
      />

      <p>{file ? `Selected file: ${file.name}` : "Choose a video to upload."}</p>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <br /><br />

      <button onClick={handleUpload} disabled={!file || isUploading}>
        {isUploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
}

