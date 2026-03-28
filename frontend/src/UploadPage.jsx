import { useState } from "react";
import { uploadVideo } from "./api";
import { useNavigate } from "react-router-dom";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) return;

    try {
      const res = await uploadVideo(file);

      console.log("UPLOAD RESPONSE:", res.data); // debug

      const jobId = res.data.id; // ✅ FIXED (IMPORTANT)

      if (!jobId) {
        throw new Error("Upload succeeded but no job ID was returned");
      }

      navigate(`/job/${jobId}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Upload Video</h2>

      <input type="file" onChange={(e) => setFile(e.target.files[0])} />

      <br /><br />

      <button onClick={handleUpload}>Upload</button>
    </div>
  );
}
