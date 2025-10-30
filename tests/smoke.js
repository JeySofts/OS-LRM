const http = require('http');

// Attempt to contact the health endpoint with retries. This makes the smoke
// test resilient to small startup timing differences when the server is
// launched separately (for example: `npm start` in another terminal).
function checkHealthOnce(timeout = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: 'localhost', port: process.env.PORT || 3000, path: '/health', timeout }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) return resolve({ ok: true, body });
        return reject(new Error('Non-200 status: ' + res.statusCode));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function waitForHealth(retries = 10, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await checkHealthOnce();
      return r;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  try {
    const r = await waitForHealth(12, 500); // ~6s max wait
    console.log('health ok:', r.body);
    process.exit(0);
  } catch (e) {
    console.error('health check failed:', e && e.message ? e.message : e);
    console.error('Make sure the server is running (in a separate terminal run `npm start`) before `npm test`).');
    process.exit(2);
  }
})();
