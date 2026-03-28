import { BrowserRouter, Routes, Route } from "react-router-dom";
import UploadPage from "./UploadPage";
import JobPage from "./JobPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/job/:id" element={<JobPage />} />
      </Routes>
    </BrowserRouter>
  );
}