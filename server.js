require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const pidusage = require('pidusage');
const Influx = require('influx');
const jwt = require('jsonwebtoken');

// Config from environment
const PORT = parseInt(process.env.PORT, 10) || 3000;
const SAMPLE_INTERVAL_MS = parseInt(process.env.SAMPLE_INTERVAL_MS, 10) || 1000;
const INFLUX_HOST = process.env.INFLUX_HOST || null;
const INFLUX_DB = process.env.INFLUX_DB || 'metrics_db';
const HOSTNAME = os.hostname();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // In production, restrict origin/list of origins
  cors: { origin: '*' }
});

// Socket auth: if SOCKET_AUTH_SECRET is set, require clients to present a JWT
const SOCKET_AUTH_SECRET = process.env.SOCKET_AUTH_SECRET || null;
if (SOCKET_AUTH_SECRET) {
  io.use((socket, next) => {
    const token = (socket.handshake.auth && socket.handshake.auth.token) || socket.handshake.query.token;
    if (!token) return next(new Error('Authentication error: token missing'));
    jwt.verify(token, SOCKET_AUTH_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error: invalid token'));
      socket.user = decoded;
      return next();
    });
  });
} else {
  console.warn('SOCKET_AUTH_SECRET not set — Socket.IO connections are not authenticated');
}

// Serve static frontend
app.use(express.static('public'));

// Basic healthcheck for containers/orchestration
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', ts: new Date().toISOString() }));

// Influx client (optional)
let influx = null;
let influxEnabled = false;
if (INFLUX_HOST) {
  try {
    influx = new Influx.InfluxDB({
      host: INFLUX_HOST,
      database: INFLUX_DB
    });
    influxEnabled = true;
    // Ensure database exists (best-effort)
    influx.getDatabaseNames()
      .then(names => {
        if (!names.includes(INFLUX_DB)) {
          return influx.createDatabase(INFLUX_DB);
        }
        return null;
      })
      .catch(err => {
        console.error('InfluxDB check/create failed:', err);
        influxEnabled = false;
      });
  } catch (err) {
    console.error('InfluxDB client initialization failed:', err);
    influxEnabled = false;
  }
}

// CPU usage calculation using os.cpus() deltas
let prevCpuInfo = null;
function getSystemCpuPercent() {
  const cpus = os.cpus();
  const totals = cpus.map(cpu => {
    const times = cpu.times;
    const total = Object.values(times).reduce((a, b) => a + b, 0);
    return { idle: times.idle, total };
  });

  const idle = totals.reduce((a, b) => a + b.idle, 0);
  const total = totals.reduce((a, b) => a + b.total, 0);

  if (!prevCpuInfo) {
    prevCpuInfo = { idle, total };
    return 0;
  }

  const idleDiff = idle - prevCpuInfo.idle;
  const totalDiff = total - prevCpuInfo.total;
  prevCpuInfo = { idle, total };
  if (totalDiff === 0) return 0;
  const usage = (1 - idleDiff / totalDiff) * 100;
  return Math.round(usage * 100) / 100; // 2 decimals
}

function getRamUsagePercent() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return Math.round((used / total) * 100 * 100) / 100; // 2 decimals
}

// Emit metrics periodically
let intervalHandle = null;
function startMetricsLoop() {
  // initialize prevCpuInfo to get a valid second reading
  getSystemCpuPercent();
  intervalHandle = setInterval(async () => {
    try {
      const cpuSystem = getSystemCpuPercent();
      // pidusage gives process CPU; kept for optional debugging
      let processCpu = 0;
      try {
        const stat = await pidusage(process.pid);
        processCpu = Math.round(stat.cpu * 100) / 100;
      } catch (e) {
        // non-fatal
        processCpu = 0;
      }

      const ram = getRamUsagePercent();
      const totalRamGB = Math.round((os.totalmem() / (1024 ** 3)) * 100) / 100;
      const payload = {
        host: HOSTNAME,
        cpu: cpuSystem,
        processCpu,
        ram,
        totalRam: totalRamGB,
        ts: new Date().toISOString()
      };

      // Emit to WebSocket clients
      io.emit('metrics', payload);

      // Optionally write to InfluxDB
      if (influxEnabled && influx) {
        try {
          influx.writePoints([
            {
              measurement: 'system_metrics',
              tags: { host: HOSTNAME },
              fields: {
                cpu: Number(cpuSystem),
                processCpu: Number(processCpu),
                ram: Number(ram),
                totalRam: Number(totalRamGB)
              },
              timestamp: new Date()
            }
          ]).catch(err => {
            console.error('Influx write failed:', err.message || err);
          });
        } catch (e) {
          console.error('Influx write error:', e.message || e);
        }
      }
    } catch (err) {
      console.error('Metrics loop error:', err && err.message ? err.message : err);
    }
  }, SAMPLE_INTERVAL_MS);
}

io.on('connection', socket => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', reason => console.log('Socket disconnected', socket.id, reason));
});

server.listen(PORT, () => {
  console.log(`OS-LRM server listening on port ${PORT} (env SAMPLE_INTERVAL_MS=${SAMPLE_INTERVAL_MS})`);
  startMetricsLoop();
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  if (intervalHandle) clearInterval(intervalHandle);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

// Attach shutdown handlers only if explicitly enabled (prevents external test harnesses
// from emitting signals that immediately terminate the server during local debug).
if (process.env.ENABLE_SHUTDOWN_HANDLERS === 'true') {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  // When running inside the automated workspace runner, external signal
  // delivery can terminate the process immediately. Ignore signal handlers
  // unless explicitly enabled so the server can stay up for local testing.
  console.log('Signal shutdown handlers are disabled (ENABLE_SHUTDOWN_HANDLERS!=true)');
}

module.exports = { app, server };
