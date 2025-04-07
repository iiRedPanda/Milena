import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { createObjectCsvWriter } from 'csv-writer';

class Logger {
    constructor() {
        this.config = {
            logDir: path.join(process.cwd(), 'logs'),
            categories: {
                debug: { retention: '7d', format: 'json' },
                error: { retention: '30d', format: 'json' },
                info: { retention: '14d', format: 'json' },
                api: { retention: '14d', format: 'csv' },
                audit: { retention: '90d', format: 'csv' },
                performance: { retention: '7d', format: 'csv' },
                security: { retention: '90d', format: 'json' }
            },
            rotationInterval: '1d',
            compression: true,
            maxSize: '100mb'
        };

        this.writers = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            // Ensure log directories exist
            await Promise.all(
                Object.keys(this.config.categories).map(category =>
                    fs.mkdir(path.join(this.config.logDir, category), { recursive: true })
                )
            );

            // Initialize CSV writers
            for (const [category, config] of Object.entries(this.config.categories)) {
                if (config.format === 'csv') {
                    this.writers.set(category, this.createCsvWriter(category));
                }
            }

            // Start log rotation scheduler
            this.scheduleLogRotation();
            
            // Clean up old logs
            await this.cleanOldLogs();
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            throw error;
        }
    }

    createCsvWriter(category) {
        const filepath = this.getLogPath(category, 'csv');
        return createObjectCsvWriter({
            path: filepath,
            header: [
                { id: 'timestamp', title: 'TIMESTAMP' },
                { id: 'level', title: 'LEVEL' },
                { id: 'message', title: 'MESSAGE' },
                { id: 'metadata', title: 'METADATA' }
            ],
            append: true
        });
    }

    getLogPath(category, extension) {
        const date = format(new Date(), 'yyyy-MM-dd');
        return path.join(this.config.logDir, category, `${date}.${extension}`);
    }

    async log(level, message, metadata = {}) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level,
                message,
                metadata: JSON.stringify(metadata)
            };

            // Determine appropriate category
            let category = 'info';
            if (level === 'error' || level === 'fatal') category = 'error';
            if (level === 'debug') category = 'debug';
            if (metadata.type === 'api') category = 'api';
            if (metadata.type === 'audit') category = 'audit';
            if (metadata.type === 'performance') category = 'performance';
            if (metadata.type === 'security') category = 'security';

            // Write log entry
            const categoryConfig = this.config.categories[category];
            if (categoryConfig.format === 'csv') {
                await this.writers.get(category).writeRecords([logEntry]);
            } else {
                const logPath = this.getLogPath(category, 'json');
                const logData = JSON.stringify(logEntry) + '\n';
                await fs.appendFile(logPath, logData);
            }

            // Console output for development
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
                if (Object.keys(metadata).length > 0) {
                    console.log('Metadata:', metadata);
                }
            }

            // Special handling for errors
            if (level === 'error' || level === 'fatal') {
                await this.handleErrorLog(logEntry);
            }
        } catch (error) {
            console.error('Logging failed:', error);
            // Fallback to console
            console.log(`[FALLBACK] ${level}: ${message}`);
        }
    }

    async handleErrorLog(logEntry) {
        try {
            // Create error report with stack trace and context
            const errorReport = {
                ...logEntry,
                process: {
                    pid: process.pid,
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                },
                stack: new Error().stack
            };

            // Save detailed error report
            const errorPath = path.join(this.config.logDir, 'error', 'detailed');
            await fs.mkdir(errorPath, { recursive: true });
            const reportPath = path.join(errorPath, `${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.json`);
            await fs.writeFile(reportPath, JSON.stringify(errorReport, null, 2));

            // Alert if critical
            if (logEntry.level === 'fatal') {
                // Implement alert mechanism (e.g., Discord webhook, email)
                await this.alertCriticalError(errorReport);
            }
        } catch (error) {
            console.error('Error handling failed:', error);
        }
    }

    async alertCriticalError(errorReport) {
        // Implement alert mechanism
        // This could send to Discord webhook, email, or other notification service
        console.error('CRITICAL ERROR:', errorReport);
    }

    async cleanOldLogs() {
        try {
            for (const [category, config] of Object.entries(this.config.categories)) {
                const retention = parseInt(config.retention);
                if (isNaN(retention)) continue;

                const categoryPath = path.join(this.config.logDir, category);
                const files = await fs.readdir(categoryPath);
                const now = new Date();

                for (const file of files) {
                    const filePath = path.join(categoryPath, file);
                    const stats = await fs.stat(filePath);
                    const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // Age in days

                    if (fileAge > retention) {
                        await fs.unlink(filePath);
                    }
                }
            }
        } catch (error) {
            console.error('Log cleanup failed:', error);
        }
    }

    scheduleLogRotation() {
        setInterval(async () => {
            try {
                // Reset CSV writers
                for (const [category, config] of Object.entries(this.config.categories)) {
                    if (config.format === 'csv') {
                        this.writers.set(category, this.createCsvWriter(category));
                    }
                }

                // Clean old logs
                await this.cleanOldLogs();
            } catch (error) {
                console.error('Log rotation failed:', error);
            }
        }, 24 * 60 * 60 * 1000); // Run daily
    }

    async getStats() {
        const stats = {
            categories: {},
            totalSize: 0,
            oldestLog: null,
            newestLog: null
        };

        try {
            for (const category of Object.keys(this.config.categories)) {
                const categoryPath = path.join(this.config.logDir, category);
                const files = await fs.readdir(categoryPath);
                let categorySize = 0;

                for (const file of files) {
                    const filePath = path.join(categoryPath, file);
                    const fileStats = await fs.stat(filePath);
                    categorySize += fileStats.size;

                    if (!stats.oldestLog || fileStats.mtime < stats.oldestLog) {
                        stats.oldestLog = fileStats.mtime;
                    }
                    if (!stats.newestLog || fileStats.mtime > stats.newestLog) {
                        stats.newestLog = fileStats.mtime;
                    }
                }

                stats.categories[category] = {
                    fileCount: files.length,
                    totalSize: categorySize
                };
                stats.totalSize += categorySize;
            }
        } catch (error) {
            console.error('Failed to get log stats:', error);
        }

        return stats;
    }
}

const logger = new Logger();
export default logger;
