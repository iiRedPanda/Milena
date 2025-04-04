import { logInfo } from './src/logger.js'; // Use ES module import for logger

const http = require('http');

const rateLimit = new Map(); // Define rateLimit to avoid runtime errors

const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            activeUsers: rateLimit.size,
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(3000, () => {
    logInfo('Health check server running on port 3000');
});
