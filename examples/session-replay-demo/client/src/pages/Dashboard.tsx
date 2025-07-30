import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Session {
  id: string;
  user_id: string;
  start_time: number;
  end_time: number | null;
  has_replay: number;
  event_count: number;
  error_count: number;
  replay_chunk_count: number;
  created_at: string;
}

interface Event {
  id: number;
  session_id: string;
  type: string;
  name: string;
  timestamp: number;
  user_id: string;
  data: any;
}

function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [errors, setErrors] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sessionsRes, eventsRes, errorsRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/events?type=custom'),
        fetch('/api/events?type=error'),
      ]);

      setSessions(await sessionsRes.json());
      setEvents(await eventsRes.json());
      setErrors(await errorsRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (start: number, end: number | null) => {
    if (!end) return 'Active';
    const duration = end - start;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1>Analytics Dashboard</h1>
        <button className="btn btn-secondary" onClick={fetchData}>
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Sessions</h3>
          <div className="value">{sessions.length}</div>
        </div>
        <div className="stat-card">
          <h3>Custom Events</h3>
          <div className="value">{events.length}</div>
        </div>
        <div className="stat-card">
          <h3>Errors Captured</h3>
          <div className="value" style={{ color: '#dc3545' }}>{errors.length}</div>
        </div>
        <div className="stat-card">
          <h3>Sessions with Replay</h3>
          <div className="value">{sessions.filter(s => s.replay_chunk_count > 0).length}</div>
        </div>
      </div>

      <div className="card">
        <h2>Sessions</h2>
        {sessions.length === 0 ? (
          <p>No sessions recorded yet. Navigate around the demo to create some!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>User</th>
                <th>Duration</th>
                <th>Events</th>
                <th>Errors</th>
                <th>Replay</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {session.id.substring(0, 8)}...
                  </td>
                  <td>{session.user_id}</td>
                  <td>{formatDuration(session.start_time, session.end_time)}</td>
                  <td>{session.event_count}</td>
                  <td>
                    {session.error_count > 0 && (
                      <span className="badge badge-error">{session.error_count}</span>
                    )}
                  </td>
                  <td>
                    {session.replay_chunk_count > 0 ? (
                      <span style={{ color: 'green' }}>✓</span>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                  <td>
                    <Link to={`/replay/${session.id}`}>
                      <button className="btn" disabled={session.replay_chunk_count === 0}>
                        View Replay
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Recent Events</h2>
        {events.length === 0 ? (
          <p>No events tracked yet. Try clicking some buttons in the demo!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event Name</th>
                <th>Session</th>
                <th>Properties</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 20).map(event => (
                <tr key={event.id}>
                  <td>{formatTime(event.timestamp)}</td>
                  <td>
                    <span className="badge badge-custom">{event.name}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {event.session_id.substring(0, 8)}...
                  </td>
                  <td>
                    <code style={{ fontSize: '12px' }}>
                      {JSON.stringify(event.data.properties || {}, null, 2).substring(0, 100)}...
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Recent Errors</h2>
        {errors.length === 0 ? (
          <p>No errors captured yet. Try triggering some errors in the demo!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Error</th>
                <th>Type</th>
                <th>Session</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, 20).map(error => (
                <tr key={error.id}>
                  <td>{formatTime(error.timestamp)}</td>
                  <td>
                    <span className="badge badge-error">
                      {error.data.message || error.name}
                    </span>
                  </td>
                  <td>{error.data.type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {error.session_id.substring(0, 8)}...
                  </td>
                  <td>
                    {error.data.context && (
                      <code style={{ fontSize: '12px' }}>{error.data.context}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Dashboard;