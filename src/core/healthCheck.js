import logger from './src/services/logger.js';
import analytics from './src/services/analytics.js';
import resourceManager from './src/services/resourceManager.js';

const http = require('http');
const os = require('os');

// Health thresholds
const THRESHOLDS = {
    CPU_PERCENT: 90,
    MEMORY_PERCENT: 90,
    ERROR_RATE: 0.1,
    RESPONSE_TIME_MS: 5000
};

async function getSystemMetrics() {
    const cpuUsage = os.loadavg()[0] * 100 / os.cpus().length;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    return {
        cpu: {
            usage: cpuUsage,
            cores: os.cpus().length
        },
        memory: {
            total: totalMem,
            free: freeMem,
            usage: memoryUsage
        },
        uptime: process.uptime()
    };
}

async function getBotMetrics() {
    const resourceMetrics = resourceManager.getMetrics();
    const analyticsData = analytics.getMetrics();

    return {
        resources: resourceMetrics,
        analytics: analyticsData,
        process: {
            memory: process.memoryUsage(),
            pid: process.pid
        }
    };
}

function checkHealth(metrics) {
    const issues = [];

    // Check CPU usage
    if (metrics.system.cpu.usage > THRESHOLDS.CPU_PERCENT) {
        issues.push(`High CPU usage: ${metrics.system.cpu.usage.toFixed(2)}%`);
    }

    // Check memory usage
    if (metrics.system.memory.usage > THRESHOLDS.MEMORY_PERCENT) {
        issues.push(`High memory usage: ${metrics.system.memory.usage.toFixed(2)}%`);
    }

    // Check resource pools
    Object.entries(metrics.bot.resources.pools).forEach(([name, pool]) => {
        if (pool.queueLength > 10) {
            issues.push(`Long queue in ${name}: ${pool.queueLength} items`);
        }
    });

    // Check error rates from analytics
    if (metrics.bot.analytics.errorRate > THRESHOLDS.ERROR_RATE) {
        issues.push(`High error rate: ${(metrics.bot.analytics.errorRate * 100).toFixed(2)}%`);
    }

    return {
        healthy: issues.length === 0,
        issues
    };
}

const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        try {
            const startTime = Date.now();

            // Gather metrics
            const [systemMetrics, botMetrics] = await Promise.all([
                getSystemMetrics(),
                getBotMetrics()
            ]);

            const metrics = {
                system: systemMetrics,
                bot: botMetrics,
                timestamp: new Date().toISOString()
            };

            // Check health status
            const health = checkHealth(metrics);

            // Calculate response time
            const responseTime = Date.now() - startTime;
            metrics.responseTime = responseTime;

            // Determine HTTP status code
            const statusCode = health.healthy ? 200 : 503;

            // Log health check results
            logger.log(health.healthy ? 'info' : 'warn', 'Health check completed', {
                healthy: health.healthy,
                issues: health.issues,
                responseTime
            });

            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: health.healthy ? 'healthy' : 'unhealthy',
                issues: health.issues,
                metrics,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            logger.log('error', 'Health check failed', { error: error.message });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const PORT = process.env.HEALTH_CHECK_PORT || 3000;

server.listen(PORT, () => {
    logger.log('info', `Health check server running on port ${PORT}`);
});
