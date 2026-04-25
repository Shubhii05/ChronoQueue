import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import JobStatusPage from "./JobStatusPage";
import JobsPage from "./JobsPage";
import DeadLetterPage from "./DeadLetterPage";
import UploadStudio from "./UploadStudio";
import MyVideosPage from "./MyVideosPage";
import { AppShell } from "./ui";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadStudio />} />
          <Route path="/videos" element={<MyVideosPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/dead-letter" element={<DeadLetterPage />} />
          <Route path="/job/:id" element={<JobStatusPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
