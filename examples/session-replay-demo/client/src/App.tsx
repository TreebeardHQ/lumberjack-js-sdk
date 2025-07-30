import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import lumberjack from "./lib/lumberjack";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import ReplayViewer from "./pages/ReplayViewer";
import Shop from "./pages/Shop";

function App() {
  const [isRecording, setIsRecording] = useState(true);

  const stopRecording = async () => {
    await lumberjack.shutdown();
    setIsRecording(false);
  };

  return (
    <div className="app">
      <nav className="nav">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/shop">Shop</Link>
          </li>
          <li>
            <Link to="/profile">Profile</Link>
          </li>
          <li style={{ marginLeft: "auto" }}>
            <Link to="/dashboard">Dashboard</Link>
          </li>
        </ul>
      </nav>

      {isRecording && (
        <div className="recording-indicator">
          <div className="recording-dot"></div>
          Recording Session
          <button className="btn btn-secondary" onClick={stopRecording}>
            Stop Recording
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/replay/:sessionId" element={<ReplayViewer />} />
      </Routes>
    </div>
  );
}

export default App;
