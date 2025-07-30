import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

interface SessionDetails {
  session: {
    id: string;
    user_id: string;
    start_time: number;
    end_time: number | null;
  };
  events: Array<{
    id: number;
    type: string;
    name: string;
    timestamp: number;
    data: any;
  }>;
}

interface ReplayData {
  session_id: string;
  events: any[];
  start_time: number;
  end_time: number;
}

function ReplayViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
    }
  }, [sessionId]);

  useEffect(() => {
    if (replayData && playerContainerRef.current && !playerRef.current) {
      // Initialize rrweb player
      playerRef.current = new rrwebPlayer({
        target: playerContainerRef.current,
        props: {
          events: replayData.events,
          width: 1024,
          height: 576,
          autoPlay: false,
          showController: false, // Hide built-in controls since we have custom ones
          tags: {
            'custom-event': 'rgb(73, 80, 246)',
            'error': 'rgb(255, 0, 0)',
          },
        },
      });

      // Calculate duration
      if (replayData.events.length > 0) {
        const firstEvent = replayData.events[0];
        const lastEvent = replayData.events[replayData.events.length - 1];
        setDuration(lastEvent.timestamp - firstEvent.timestamp);
      }
    }

    // Cleanup
    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [replayData]);

  const fetchSessionData = async () => {
    try {
      const [detailsRes, replayRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`),
        fetch(`/api/sessions/${sessionId}/replay`),
      ]);

      if (!detailsRes.ok || !replayRes.ok) {
        throw new Error('Failed to fetch session data');
      }

      const details = await detailsRes.json();
      const replay = await replayRes.json();

      setSessionDetails(details);
      setReplayData(replay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const updateProgress = () => {
    if (playerRef.current && playerRef.current.getMetaData) {
      const metadata = playerRef.current.getMetaData();
      if (metadata && metadata.currentTime !== undefined) {
        setCurrentTime(metadata.currentTime);
      }
    }
  };

  const handlePlayPause = () => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      } else {
        playerRef.current.play();
        progressIntervalRef.current = window.setInterval(updateProgress, 100);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleRestart = () => {
    if (playerRef.current) {
      playerRef.current.goto(0);
      setCurrentTime(0);
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (playerRef.current) {
      playerRef.current.setSpeed(speed);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseInt(e.target.value);
    setCurrentTime(newTime);
    if (playerRef.current) {
      playerRef.current.goto(newTime);
    }
  };

  const formatTimeDisplay = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading replay...</p>
        </div>
      </div>
    );
  }

  if (error || !sessionDetails || !replayData) {
    return (
      <div className="container">
        <div className="error-display">
          <h2>Error Loading Replay</h2>
          <p>{error || 'Session not found'}</p>
          <Link to="/dashboard">
            <button className="btn">Back to Dashboard</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1>Session Replay</h1>
        <Link to="/dashboard">
          <button className="btn btn-secondary">Back to Dashboard</button>
        </Link>
      </div>

      <div className="card">
        <h2>Session Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '15px' }}>
          <div>
            <strong>Session ID:</strong>
            <p style={{ fontFamily: 'monospace', fontSize: '14px' }}>{sessionDetails.session.id}</p>
          </div>
          <div>
            <strong>User ID:</strong>
            <p>{sessionDetails.session.user_id}</p>
          </div>
          <div>
            <strong>Start Time:</strong>
            <p>{formatTime(sessionDetails.session.start_time)}</p>
          </div>
          <div>
            <strong>Events:</strong>
            <p>{sessionDetails.events.length} total</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Replay Player</h2>
        <div style={{ marginTop: '20px' }}>
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            alignItems: 'center',
            marginBottom: '15px',
            padding: '10px',
            background: '#f8f9fa',
            borderRadius: '4px'
          }}>
            <button 
              className="btn"
              onClick={handlePlayPause}
              style={{ minWidth: '100px' }}
            >
              {isPlaying ? '⏸ Pause' : '▶️ Play'}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={handleRestart}
            >
              ⏮ Restart
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span>Speed:</span>
              <button 
                className="btn btn-secondary"
                onClick={() => handleSpeedChange(0.5)}
                style={{ padding: '5px 10px' }}
              >
                0.5x
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => handleSpeedChange(1)}
                style={{ padding: '5px 10px' }}
              >
                1x
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => handleSpeedChange(2)}
                style={{ padding: '5px 10px' }}
              >
                2x
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => handleSpeedChange(4)}
                style={{ padding: '5px 10px' }}
              >
                4x
              </button>
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '15px',
            padding: '10px',
            background: '#f8f9fa',
            borderRadius: '4px'
          }}>
            <span style={{ minWidth: '50px', fontSize: '14px' }}>
              {formatTimeDisplay(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={handleSeek}
              style={{
                flex: 1,
                height: '6px',
                cursor: 'pointer',
                appearance: 'none',
                background: `linear-gradient(to right, #0066cc 0%, #0066cc ${(currentTime / duration) * 100}%, #ddd ${(currentTime / duration) * 100}%, #ddd 100%)`,
                borderRadius: '3px',
                outline: 'none',
              }}
              className="replay-scrubber"
            />
            <span style={{ minWidth: '50px', fontSize: '14px', textAlign: 'right' }}>
              {formatTimeDisplay(duration)}
            </span>
          </div>
          <div 
            ref={playerContainerRef} 
            className="replay-player"
          />
        </div>
      </div>

      <div className="card">
        <h2>Session Events Timeline</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Event</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {sessionDetails.events.map(event => (
              <tr key={event.id}>
                <td>{formatTime(event.timestamp)}</td>
                <td>
                  <span className={`badge badge-${event.type === 'error' ? 'error' : 'custom'}`}>
                    {event.type}
                  </span>
                </td>
                <td>{event.name || event.data.message}</td>
                <td>
                  <details>
                    <summary style={{ cursor: 'pointer' }}>View Details</summary>
                    <pre style={{ 
                      fontSize: '12px', 
                      background: '#f5f5f5', 
                      padding: '10px',
                      borderRadius: '4px',
                      marginTop: '10px' 
                    }}>
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReplayViewer;