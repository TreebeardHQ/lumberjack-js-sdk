import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize in-memory SQLite database
const dbPromise = open({
  filename: ':memory:',
  driver: sqlite3.Database
});

async function initDb() {
  const db = await dbPromise;
  
  await db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      has_replay BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT,
      timestamp INTEGER NOT NULL,
      user_id TEXT,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE replay_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      events TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX idx_events_session ON events(session_id);
    CREATE INDEX idx_replay_session ON replay_chunks(session_id);
  `);

  console.log('Database initialized');
}

// API Routes

// Create or update session
app.post('/api/sessions', async (req, res) => {
  const db = await dbPromise;
  const { session_id, user_id, has_replay } = req.body;

  try {
    await db.run(
      `INSERT INTO sessions (id, user_id, start_time, has_replay) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
       end_time = ?`,
      [session_id, user_id, Date.now(), has_replay ? 1 : 0, Date.now()]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Store events (errors, custom events, and replay data)
app.post('/api/events', async (req, res) => {
  const db = await dbPromise;
  const { session_id, events } = req.body;

  try {
    await db.run('BEGIN TRANSACTION');

    for (const event of events) {
      if (event.type === 'session_replay') {
        // Store replay data in chunks
        const replayData = event.data;
        await db.run(
          `INSERT INTO replay_chunks (session_id, chunk_index, events, start_time, end_time)
           VALUES (?, ?, ?, ?, ?)`,
          [
            session_id,
            0, // For simplicity, using single chunk
            JSON.stringify(replayData.events),
            replayData.startTime,
            replayData.endTime
          ]
        );
      } else {
        // Store regular events (errors, custom events)
        await db.run(
          `INSERT INTO events (session_id, type, name, timestamp, user_id, data)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            session_id,
            event.type,
            event.data.name || event.data.message || '',
            event.timestamp,
            event.userId || null,
            JSON.stringify(event.data)
          ]
        );
      }
    }

    await db.run('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error storing events:', error);
    res.status(500).json({ error: 'Failed to store events' });
  }
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  const db = await dbPromise;
  try {
    const sessions = await db.all(`
      SELECT 
        s.*,
        COUNT(DISTINCT e.id) as event_count,
        COUNT(DISTINCT CASE WHEN e.type = 'error' THEN e.id END) as error_count,
        COUNT(DISTINCT r.id) as replay_chunk_count
      FROM sessions s
      LEFT JOIN events e ON s.id = e.session_id
      LEFT JOIN replay_chunks r ON s.id = r.session_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session details with events
app.get('/api/sessions/:id', async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;

  try {
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const events = await db.all(
      'SELECT * FROM events WHERE session_id = ? ORDER BY timestamp',
      id
    );

    res.json({
      session,
      events: events.map(e => ({
        ...e,
        data: JSON.parse(e.data)
      }))
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Get replay data for a session
app.get('/api/sessions/:id/replay', async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;

  try {
    const chunks = await db.all(
      'SELECT * FROM replay_chunks WHERE session_id = ? ORDER BY chunk_index',
      id
    );

    if (chunks.length === 0) {
      return res.status(404).json({ error: 'No replay data found' });
    }

    // Combine all chunks into single event array
    const allEvents = chunks.flatMap(chunk => JSON.parse(chunk.events));

    res.json({
      session_id: id,
      events: allEvents,
      start_time: chunks[0].start_time,
      end_time: chunks[chunks.length - 1].end_time
    });
  } catch (error) {
    console.error('Error fetching replay:', error);
    res.status(500).json({ error: 'Failed to fetch replay' });
  }
});

// Get all events
app.get('/api/events', async (req, res) => {
  const db = await dbPromise;
  const { type } = req.query;

  try {
    let query = 'SELECT * FROM events';
    const params: any[] = [];
    
    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT 100';

    const events = await db.all(query, params);
    res.json(events.map(e => ({
      ...e,
      data: JSON.parse(e.data)
    })));
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Start server
async function start() {
  await initDb();
  
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);