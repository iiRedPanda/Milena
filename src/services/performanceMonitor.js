import logger from './logger.js';
import os from 'os';

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            commands: new Map(),
            api: new Map(),
            memory: [],
            cpu: [],
            latency: []
        };

        this.config = {
            sampleInterval: 60000, // 1 minute
            retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
            alertThresholds: {
                memory: 90, // 90% usage
                cpu: 80, // 80% usage
                latency: 1000, // 1 second
                errorRate: 0.1 // 10% error rate
            }
        };

        this.startMonitoring();
    }

    /**
     * Start monitoring system performance
     */
    startMonitoring() {
        setInterval(() => this.collectMetrics(), this.config.sampleInterval);
        this.cleanupOldMetrics();
    }

    /**
     * Collect system metrics
     */
    async collectMetrics() {
        try {
            const currentMetrics = {
                timestamp: Date.now(),
                memory: this.getMemoryMetrics(),
                cpu: await this.getCpuMetrics(),
                system: this.getSystemMetrics()
            };

            // Store metrics
            this.metrics.memory.push(currentMetrics.memory);
            this.metrics.cpu.push(currentMetrics.cpu);

            // Log metrics
            await logger.log('info', 'Performance metrics collected', {
                type: 'performance',
                metrics: currentMetrics
            });

            // Check for alerts
            await this.checkAlerts(currentMetrics);
        } catch (error) {
            await logger.log('error', 'Failed to collect metrics', {
                type: 'performance',
                error: error.message
            });
        }
    }

    /**
     * Get memory usage metrics
     */
    getMemoryMetrics() {
        const used = process.memoryUsage();
        const system = os.totalmem() - os.freemem();
        const systemTotal = os.totalmem();

        return {
            heap: {
                used: used.heapUsed,
                total: used.heapTotal,
                percentage: (used.heapUsed / used.heapTotal) * 100
            },
            rss: {
                used: used.rss,
                percentage: (used.rss / systemTotal) * 100
            },
            system: {
                used: system,
                total: systemTotal,
                percentage: (system / systemTotal) * 100
            }
        };
    }

    /**
     * Get CPU usage metrics
     */
    async getCpuMetrics() {
        const cpus = os.cpus();
        const totalTimes = cpus.reduce((acc, cpu) => {
            Object.keys(cpu.times).forEach(type => {
                acc[type] = (acc[type] || 0) + cpu.times[type];
            });
            return acc;
        }, {});

        const total = Object.values(totalTimes).reduce((acc, time) => acc + time, 0);
        return {
            usage: (1 - totalTimes.idle / total) * 100,
            cores: cpus.length,
            load: os.loadavg()
        };
    }

    /**
     * Get general system metrics
     */
    getSystemMetrics() {
        return {
            uptime: process.uptime(),
            platform: process.platform,
            nodeVersion: process.version,
            osUptime: os.uptime(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem()
        };
    }

    /**
     * Track command execution performance
     */
    async trackCommand(commandName, duration, success) {
        const metrics = this.metrics.commands.get(commandName) || {
            count: 0,
            totalDuration: 0,
            failures: 0,
            avgDuration: 0
        };

        metrics.count++;
        metrics.totalDuration += duration;
        metrics.avgDuration = metrics.totalDuration / metrics.count;
        if (!success) metrics.failures++;

        this.metrics.commands.set(commandName, metrics);

        await logger.log('info', 'Command execution tracked', {
            type: 'performance',
            command: commandName,
            metrics
        });
    }

    /**
     * Track API call performance
     */
    async trackApiCall(endpoint, duration, success) {
        const metrics = this.metrics.api.get(endpoint) || {
            count: 0,
            totalDuration: 0,
            failures: 0,
            avgDuration: 0
        };

        metrics.count++;
        metrics.totalDuration += duration;
        metrics.avgDuration = metrics.totalDuration / metrics.count;
        if (!success) metrics.failures++;

        this.metrics.api.set(endpoint, metrics);

        await logger.log('info', 'API call tracked', {
            type: 'performance',
            endpoint,
            metrics
        });
    }

    /**
     * Track Discord API latency
     */
    trackLatency(latency) {
        this.metrics.latency.push({
            timestamp: Date.now(),
            value: latency
        });
    }

    /**
     * Check for performance issues and trigger alerts
     */
    async checkAlerts(currentMetrics) {
        const alerts = [];

        // Check memory usage
        if (currentMetrics.memory.system.percentage > this.config.alertThresholds.memory) {
            alerts.push({
                type: 'memory',
                message: `High memory usage: ${currentMetrics.memory.system.percentage.toFixed(2)}%`
            });
        }

        // Check CPU usage
        if (currentMetrics.cpu.usage > this.config.alertThresholds.cpu) {
            alerts.push({
                type: 'cpu',
                message: `High CPU usage: ${currentMetrics.cpu.usage.toFixed(2)}%`
            });
        }

        // Check latency
        const avgLatency = this.calculateAverageLatency();
        if (avgLatency > this.config.alertThresholds.latency) {
            alerts.push({
                type: 'latency',
                message: `High average latency: ${avgLatency.toFixed(2)}ms`
            });
        }

        // Log alerts
        if (alerts.length > 0) {
            await logger.log('warn', 'Performance alerts triggered', {
                type: 'performance',
                alerts
            });
        }
    }

    /**
     * Calculate average latency over recent period
     */
    calculateAverageLatency() {
        const recentLatency = this.metrics.latency
            .filter(entry => Date.now() - entry.timestamp < 5 * 60 * 1000); // Last 5 minutes

        if (recentLatency.length === 0) return 0;

        return recentLatency.reduce((sum, entry) => sum + entry.value, 0) / recentLatency.length;
    }

    /**
     * Clean up old metrics data
     */
    cleanupOldMetrics() {
        setInterval(() => {
            const cutoff = Date.now() - this.config.retentionPeriod;

            this.metrics.memory = this.metrics.memory
                .filter(entry => entry.timestamp > cutoff);
            this.metrics.cpu = this.metrics.cpu
                .filter(entry => entry.timestamp > cutoff);
            this.metrics.latency = this.metrics.latency
                .filter(entry => entry.timestamp > cutoff);

            // Log cleanup
            logger.log('debug', 'Old metrics cleaned up', {
                type: 'performance',
                remainingEntries: {
                    memory: this.metrics.memory.length,
                    cpu: this.metrics.cpu.length,
                    latency: this.metrics.latency.length
                }
            });
        }, this.config.retentionPeriod);
    }

    /**
     * Get performance report
     */
    async getPerformanceReport() {
        return {
            commands: Object.fromEntries(this.metrics.commands),
            api: Object.fromEntries(this.metrics.api),
            system: {
                memory: this.getMemoryMetrics(),
                cpu: await this.getCpuMetrics(),
                metrics: this.getSystemMetrics()
            },
            latency: {
                current: this.calculateAverageLatency(),
                history: this.metrics.latency.slice(-60) // Last 60 readings
            }
        };
    }
}

const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
