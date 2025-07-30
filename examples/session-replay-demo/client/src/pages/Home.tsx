import lumberjack from '../lib/lumberjack';

function Home() {
  const handleCustomEvent = () => {
    lumberjack.track('button_clicked', {
      button: 'custom-event',
      page: 'home',
      timestamp: new Date().toISOString(),
    });
    alert('Custom event tracked!');
  };

  const showSessionInfo = () => {
    const session = lumberjack.getSession();
    const sessionId = lumberjack.getSessionId();
    const isRecording = lumberjack.isRecording();
    const user = lumberjack.getUser();
    const duration = lumberjack.getSessionDuration();
    const remaining = lumberjack.getSessionRemainingTime();

    const formatDuration = (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    };

    alert(`Session Info:
- Session ID: ${sessionId}
- Recording: ${isRecording ? 'Yes' : 'No'}
- User: ${user?.name} (${user?.email})
- Start Time: ${session ? new Date(session.startTime).toLocaleString() : 'N/A'}
- Duration: ${formatDuration(duration)}
- Time Remaining: ${formatDuration(remaining)}
- Max Length: 30 minutes (demo setting)`);
  };

  const handleError = () => {
    try {
      // Intentionally cause an error
      const obj: any = null;
      obj.nonExistentMethod();
    } catch (error) {
      lumberjack.captureError(error as Error, {
        context: 'intentional_error',
        page: 'home',
      });
      alert('Error captured!');
    }
  };

  const handleAsyncError = () => {
    // Trigger unhandled promise rejection
    Promise.reject(new Error('Async operation failed!'));
    alert('Async error triggered - check the dashboard!');
  };

  const handleResourceError = () => {
    // Create an image with invalid source
    const img = document.createElement('img');
    img.src = 'https://invalid-domain-that-does-not-exist.com/image.jpg';
    document.body.appendChild(img);
    setTimeout(() => img.remove(), 100);
    alert('Resource error triggered - check the dashboard!');
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Lumberjack Session Replay Demo</h1>
      </div>

      <div className="card">
        <h2>Welcome to the Demo</h2>
        <p style={{ marginBottom: '20px' }}>
          This demo showcases Lumberjack's session replay, error tracking, and custom event features.
          Navigate through the pages, interact with elements, and trigger events. Then visit the
          dashboard to view replays and analytics.
        </p>
      </div>

      <div className="demo-section">
        <div className="card">
          <h2>Custom Events</h2>
          <p style={{ marginBottom: '15px' }}>Track custom user interactions and business events.</p>
          <button className="btn btn-success" onClick={handleCustomEvent}>
            Track Custom Event
          </button>
        </div>

        <div className="card">
          <h2>Error Tracking</h2>
          <p style={{ marginBottom: '15px' }}>Capture and track JavaScript errors.</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-danger" onClick={handleError}>
              Trigger Error
            </button>
            <button className="btn btn-danger" onClick={handleAsyncError}>
              Trigger Async Error
            </button>
            <button className="btn btn-danger" onClick={handleResourceError}>
              Trigger Resource Error
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Session Recording</h2>
          <p style={{ marginBottom: '15px' }}>
            Your session is being recorded. Navigate between pages, click buttons, and interact
            with the UI. Stop recording when done and view the replay in the dashboard.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button className="btn" onClick={showSessionInfo}>
              Show Session Info
            </button>
          </div>
          <div className="lumberjack-mask">
            <p style={{ padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
              This content is masked and won't appear in replays.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;