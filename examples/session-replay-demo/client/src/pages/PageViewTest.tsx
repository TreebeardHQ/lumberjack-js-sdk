import { useState, useEffect } from "react";
import lumberjack from "../lib/lumberjack";

function PageViewTest() {
  const [events, setEvents] = useState<any[]>([]);
  const [hashCounter, setHashCounter] = useState(0);
  
  useEffect(() => {
    // Track custom event to mark test page
    lumberjack.track("page_view_test_loaded");
    
    // Log current session info
    console.log("Session ID:", lumberjack.getSessionId());
    console.log("Is Recording:", lumberjack.isRecording());
  }, []);

  const handlePushState = () => {
    const newPath = `/page-view-test/push-${Date.now()}`;
    window.history.pushState({}, "", newPath);
    lumberjack.track("test_push_state", { path: newPath });
  };

  const handleReplaceState = () => {
    const newPath = `/page-view-test/replace-${Date.now()}`;
    window.history.replaceState({}, "", newPath);
    lumberjack.track("test_replace_state", { path: newPath });
  };

  const handleHashChange = () => {
    const newHash = `#section-${hashCounter + 1}`;
    window.location.hash = newHash;
    setHashCounter(hashCounter + 1);
    lumberjack.track("test_hash_change", { hash: newHash });
  };

  const handleBack = () => {
    window.history.back();
    lumberjack.track("test_browser_back");
  };

  const handleForward = () => {
    window.history.forward();
    lumberjack.track("test_browser_forward");
  };

  const simulateSPANavigation = () => {
    // Simulate what a typical SPA router would do
    const paths = ["/products", "/products/123", "/checkout", "/confirmation"];
    let index = 0;
    
    const interval = setInterval(() => {
      if (index < paths.length) {
        window.history.pushState({}, "", paths[index]);
        lumberjack.track("spa_navigation_simulation", { 
          path: paths[index],
          step: index + 1
        });
        index++;
      } else {
        clearInterval(interval);
      }
    }, 1000);
  };

  const fetchRecentEvents = async () => {
    try {
      const sessionId = lumberjack.getSessionId();
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      
      // Filter for page_view events
      const pageViewEvents = data.events.filter(
        (e: any) => e.name === "page_view" || e.data?.name === "page_view"
      );
      
      setEvents(pageViewEvents);
      console.log("Page View Events:", pageViewEvents);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Page View Tracking Test</h1>
        <p>Test automatic page view tracking with different navigation methods</p>
      </div>

      <div className="card">
        <h2>Navigation Controls</h2>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
          <button className="btn" onClick={handlePushState}>
            Push State (SPA Navigation)
          </button>
          <button className="btn" onClick={handleReplaceState}>
            Replace State
          </button>
          <button className="btn" onClick={handleHashChange}>
            Change Hash
          </button>
          <button className="btn btn-secondary" onClick={handleBack}>
            ← Browser Back
          </button>
          <button className="btn btn-secondary" onClick={handleForward}>
            Browser Forward →
          </button>
        </div>
        
        <div style={{ marginTop: "20px" }}>
          <button className="btn btn-primary" onClick={simulateSPANavigation}>
            Simulate SPA Navigation (4 steps)
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Current Location</h2>
        <div style={{ fontFamily: "monospace", background: "#f5f5f5", padding: "15px", borderRadius: "4px" }}>
          <div><strong>URL:</strong> {window.location.href}</div>
          <div><strong>Path:</strong> {window.location.pathname}</div>
          <div><strong>Hash:</strong> {window.location.hash || "(none)"}</div>
          <div><strong>Search:</strong> {window.location.search || "(none)"}</div>
        </div>
      </div>

      <div className="card">
        <h2>Page View Events</h2>
        <button className="btn btn-secondary" onClick={fetchRecentEvents}>
          Refresh Events
        </button>
        
        {events.length > 0 ? (
          <div style={{ marginTop: "20px" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Navigation Type</th>
                  <th>URL</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  const eventData = event.data || {};
                  const properties = eventData.properties || {};
                  return (
                    <tr key={index}>
                      <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                      <td>
                        <span className="badge badge-custom">
                          {properties.navigation_type || "unknown"}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                        {properties.url || properties.path || "-"}
                      </td>
                      <td>{properties.title || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            <details style={{ marginTop: "20px" }}>
              <summary style={{ cursor: "pointer" }}>View Raw Events</summary>
              <pre style={{ 
                fontSize: "12px", 
                background: "#f5f5f5", 
                padding: "10px", 
                borderRadius: "4px",
                marginTop: "10px",
                overflow: "auto"
              }}>
                {JSON.stringify(events, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p style={{ marginTop: "20px", color: "#666" }}>
            No events loaded yet. Click "Refresh Events" to load page view events.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Instructions</h2>
        <ol>
          <li>Use the navigation controls above to test different types of navigation</li>
          <li>Open the browser console to see logged events</li>
          <li>Click "Refresh Events" to see the page_view events sent to the server</li>
          <li>Try using the browser's back/forward buttons after creating some history</li>
          <li>Check the Dashboard page to see all events in the session</li>
        </ol>
        
        <div style={{ 
          marginTop: "20px", 
          padding: "15px", 
          background: "#f0f8ff", 
          borderRadius: "4px",
          border: "1px solid #0066cc"
        }}>
          <strong>Note:</strong> Page view events are automatically tracked when:
          <ul style={{ marginTop: "10px", marginBottom: 0 }}>
            <li>The page first loads (initial_load)</li>
            <li>Browser back/forward is used (browser_navigation)</li>
            <li>Hash changes occur (hash_change)</li>
            <li>History.pushState is called (push_state)</li>
            <li>History.replaceState is called (replace_state)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default PageViewTest;