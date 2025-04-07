import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CONFIG } from '../constants/config.js';
import { ensureDir } from 'fs-extra';
import fs from 'fs/promises';
import zlib from 'zlib';
import { MESSAGES } from '../constants/messages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '../../data/logs');
const ERROR_LOG_DIR = join(LOGS_DIR, 'error');
const COMBINED_LOG_DIR = join(LOGS_DIR, 'combined');
const ARCHIVE_DIR = join(LOGS_DIR, 'archive');
const DAILY_DIR = join(LOGS_DIR, 'daily');
const WEEKLY_DIR = join(LOGS_DIR, 'weekly');

// Ensure log directories exist
ensureDir(ERROR_LOG_DIR).catch(error => {
    console.error('Failed to create error log directory:', error);
});
ensureDir(COMBINED_LOG_DIR).catch(error => {
    console.error('Failed to create combined log directory:', error);
});
ensureDir(ARCHIVE_DIR).catch(error => {
    console.error('Failed to create archive directory:', error);
});
ensureDir(DAILY_DIR).catch(error => {
    console.error('Failed to create daily log directory:', error);
});
ensureDir(WEEKLY_DIR).catch(error => {
    console.error('Failed to create weekly log directory:', error);
});

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        new winston.transports.File({
            filename: join(ERROR_LOG_DIR, 'error.log'),  
            level: 'error',
            maxsize: CONFIG.LOGGING.MAX_FILE_SIZE,
            maxFiles: CONFIG.LOGGING.MAX_FILES,
            tailable: true,
            zippedArchive: true,
            rotationFormat: (info) => {
                const date = new Date(info.timestamp);
                return `error-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.log`;
            }
        }),
        new winston.transports.File({
            filename: join(COMBINED_LOG_DIR, 'combined.log'),  
            maxsize: CONFIG.LOGGING.MAX_FILE_SIZE,
            maxFiles: CONFIG.LOGGING.MAX_FILES,
            tailable: true,
            zippedArchive: true,
            rotationFormat: (info) => {
                const date = new Date(info.timestamp);
                return `combined-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.log`;
            }
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Add custom log levels
logger.addLevel('audit', 25, {
    color: 'magenta'
});

logger.addLevel('trace', 10, {
    color: 'cyan'
});

// Log file compression
logger.compressLog = async (filePath) => {
    try {
        const archivePath = join(ARCHIVE_DIR, `${Date.now()}-${path.basename(filePath)}.gz`);
        const fileData = await fs.readFile(filePath);
        const compressedData = await new Promise((resolve, reject) => {
            zlib.gzip(fileData, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        await fs.writeFile(archivePath, compressedData);
        await fs.unlink(filePath);
        logger.info('Log file compressed', {
            original: filePath,
            archive: archivePath,
            compression: 'gzip'
        });
    } catch (error) {
        logger.error('Failed to compress log file', {
            error: error.message,
            stack: error.stack,
            file: filePath
        });
    }
};

// Log aggregation
logger.aggregateLogs = async () => {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Aggregate daily logs
        const errorFiles = await fs.readdir(ERROR_LOG_DIR);
        const combinedFiles = await fs.readdir(COMBINED_LOG_DIR);

        const dailyStats = {
            date: today,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            errorTypes: new Map(),
            topErrors: []
        };

        // Process error logs
        for (const file of errorFiles) {
            if (file.includes(yesterdayStr)) {
                const content = await fs.readFile(join(ERROR_LOG_DIR, file), 'utf-8');
                const lines = content.split('\n');
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const logEntry = JSON.parse(line);
                        dailyStats.errorCount++;
                        
                        const errorType = logEntry.errorType || 'Unknown';
                        const count = dailyStats.errorTypes.get(errorType) || 0;
                        dailyStats.errorTypes.set(errorType, count + 1);
                    } catch (error) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }
        }

        // Process combined logs
        for (const file of combinedFiles) {
            if (file.includes(yesterdayStr)) {
                const content = await fs.readFile(join(COMBINED_LOG_DIR, file), 'utf-8');
                const lines = content.split('\n');
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const logEntry = JSON.parse(line);
                        switch (logEntry.level) {
                            case 'warning':
                                dailyStats.warningCount++;
                                break;
                            case 'info':
                                dailyStats.infoCount++;
                                break;
                        }
                    } catch (error) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }
        }

        // Sort errors by frequency
        dailyStats.topErrors = Array.from(dailyStats.errorTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Save daily summary
        const dailySummaryPath = join(DAILY_DIR, `${yesterdayStr}-summary.json`);
        await fs.writeFile(dailySummaryPath, JSON.stringify(dailyStats, null, 2));

        // Generate weekly summary
        const weeklyStats = await logger.generateWeeklySummary();
        const weeklySummaryPath = join(WEEKLY_DIR, `${yesterdayStr}-weekly-summary.json`);
        await fs.writeFile(weeklySummaryPath, JSON.stringify(weeklyStats, null, 2));

        logger.info('Log aggregation completed', {
            date: today,
            errorCount: dailyStats.errorCount,
            warningCount: dailyStats.warningCount,
            infoCount: dailyStats.infoCount
        });

    } catch (error) {
        logger.error('Failed to aggregate logs', {
            error: error.message,
            stack: error.stack
        });
    }
};

// Generate weekly summary
logger.generateWeeklySummary = async () => {
    try {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        
        const summaries = await fs.readdir(DAILY_DIR);
        const weeklyStats = {
            startDate: weekStart.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0],
            totalErrors: 0,
            totalWarnings: 0,
            totalInfos: 0,
            errorTrends: new Map(),
            errorDistribution: new Map()
        };

        for (const file of summaries) {
            const match = file.match(/(\d{4}-\d{2}-\d{2})-summary.json/);
            if (!match) continue;

            const date = match[1];
            const dateObj = new Date(date);
            if (dateObj < weekStart) continue;

            const content = await fs.readFile(join(DAILY_DIR, file), 'utf-8');
            const stats = JSON.parse(content);

            weeklyStats.totalErrors += stats.errorCount;
            weeklyStats.totalWarnings += stats.warningCount;
            weeklyStats.totalInfos += stats.infoCount;

            // Track error trends
            stats.topErrors.forEach(([errorType, count]) => {
                const currentCount = weeklyStats.errorTrends.get(errorType) || 0;
                weeklyStats.errorTrends.set(errorType, currentCount + count);
            });

            // Track error distribution
            weeklyStats.errorDistribution.set(date, stats.errorCount);
        }

        // Convert Maps to arrays for easier JSON serialization
        weeklyStats.errorTrends = Array.from(weeklyStats.errorTrends.entries())
            .sort((a, b) => b[1] - a[1]);
        weeklyStats.errorDistribution = Array.from(weeklyStats.errorDistribution.entries());

        return weeklyStats;
    } catch (error) {
        logger.error('Failed to generate weekly summary', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

// Schedule log aggregation
setInterval(logger.aggregateLogs, 24 * 60 * 60 * 1000); // Run daily at midnight

// Log search functionality
logger.searchLogs = async (query, options = {}) => {
    try {
        const { type = 'combined', limit = 100, startTime, endTime } = options;
        const searchDir = type === 'error' ? ERROR_LOG_DIR : COMBINED_LOG_DIR;
        const files = await fs.readdir(searchDir);
        
        // Sort files by modification time (newest first)
        const filesWithStats = await Promise.all(
            files.map(async file => ({
                file,
                stats: await fs.stat(join(searchDir, file))
            }))
        );
        
        filesWithStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

        const results = [];
        for (const { file, stats } of filesWithStats) {
            if (startTime && stats.mtimeMs < startTime) continue;
            if (endTime && stats.mtimeMs > endTime) continue;

            const content = await fs.readFile(join(searchDir, file), 'utf-8');
            const lines = content.split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const logEntry = JSON.parse(line);
                    if (logEntry.message.includes(query)) {
                        results.push({
                            ...logEntry,
                            file,
                            timestamp: new Date(logEntry.timestamp).toISOString()
                        });
                        if (results.length >= limit) break;
                    }
                } catch (error) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
            if (results.length >= limit) break;
        }

        return results;
    } catch (error) {
        logger.error('Failed to search logs', {
            error: error.message,
            stack: error.stack,
            query,
            options
        });
        throw error;
    }
};

// Log export functionality
logger.exportLogs = async (options = {}) => {
    try {
        const { type = 'combined', format = 'json', startTime, endTime } = options;
        const searchDir = type === 'error' ? ERROR_LOG_DIR : COMBINED_LOG_DIR;
        const files = await fs.readdir(searchDir);
        
        // Sort files by modification time (newest first)
        const filesWithStats = await Promise.all(
            files.map(async file => ({
                file,
                stats: await fs.stat(join(searchDir, file))
            }))
        );
        
        filesWithStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

        const exportData = [];
        for (const { file, stats } of filesWithStats) {
            if (startTime && stats.mtimeMs < startTime) continue;
            if (endTime && stats.mtimeMs > endTime) continue;

            const content = await fs.readFile(join(searchDir, file), 'utf-8');
            const lines = content.split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const logEntry = JSON.parse(line);
                    exportData.push(logEntry);
                } catch (error) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        const exportPath = join(ARCHIVE_DIR, `export-${type}-${Date.now()}.${format}`);
        let exportContent;

        if (format === 'json') {
            exportContent = JSON.stringify(exportData, null, 2);
        } else if (format === 'csv') {
            const headers = Object.keys(exportData[0] || {});
            exportContent = [
                headers.join(','),
                ...exportData.map(entry => headers.map(key => 
                    entry[key] ? JSON.stringify(entry[key]) : ''
                ).join(','))
            ].join('\n');
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }

        await fs.writeFile(exportPath, exportContent);
        return exportPath;
    } catch (error) {
        logger.error('Failed to export logs', {
            error: error.message,
            stack: error.stack,
            options
        });
        throw error;
    }
};

// Add disk usage monitoring
logger.monitorDiskUsage = async () => {
    try {
        const totalSize = await logger.calculateLogDirectorySize();
        const maxSize = CONFIG.LOGGING.MAX_FILE_SIZE * CONFIG.LOGGING.MAX_FILES;
        const usagePercentage = (totalSize / maxSize) * 100;

        // Log disk usage
        logger.info('Log disk usage', {
            totalSize: totalSize,
            maxSize: maxSize,
            usagePercentage: usagePercentage
        });

        // Check if we need to trigger emergency cleanup
        if (usagePercentage > 90) {
            logger.warn('High disk usage detected - triggering emergency cleanup');
            await logger.emergencyCleanup();
        }

    } catch (error) {
        logger.error('Failed to monitor disk usage', {
            error: error.message,
            stack: error.stack
        });
    }
};

// Calculate total size of log directory
logger.calculateLogDirectorySize = async () => {
    let totalSize = 0;
    
    // Get all files in log directories
    const errorFiles = await fs.readdir(ERROR_LOG_DIR);
    const combinedFiles = await fs.readdir(COMBINED_LOG_DIR);
    const archiveFiles = await fs.readdir(ARCHIVE_DIR);

    // Calculate size of all directories
    for (const file of [...errorFiles, ...combinedFiles, ...archiveFiles]) {
        const filePath = join(
            file.startsWith('error') ? ERROR_LOG_DIR :
            file.startsWith('combined') ? COMBINED_LOG_DIR :
            ARCHIVE_DIR,
            file
        );
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
    }

    return totalSize;
};

// Emergency cleanup with improved logic
logger.emergencyCleanup = async () => {
    try {
        // Get all files with their stats
        const errorFiles = await fs.readdir(ERROR_LOG_DIR);
        const combinedFiles = await fs.readdir(COMBINED_LOG_DIR);
        const archiveFiles = await fs.readdir(ARCHIVE_DIR);

        // Sort files by modification time
        const allFiles = [
            ...errorFiles.map(file => ({
                type: 'error',
                file,
                path: join(ERROR_LOG_DIR, file),
                stats: fs.statSync(join(ERROR_LOG_DIR, file))
            })),
            ...combinedFiles.map(file => ({
                type: 'combined',
                file,
                path: join(COMBINED_LOG_DIR, file),
                stats: fs.statSync(join(COMBINED_LOG_DIR, file))
            })),
            ...archiveFiles.map(file => ({
                type: 'archive',
                file,
                path: join(ARCHIVE_DIR, file),
                stats: fs.statSync(join(ARCHIVE_DIR, file))
            }))
        ];

        // Sort all files by modification time
        allFiles.sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);

        // Calculate current size
        let currentSize = await logger.calculateLogDirectorySize();
        const targetSize = CONFIG.LOGGING.MAX_FILE_SIZE * CONFIG.LOGGING.MAX_FILES * 0.7;

        // Remove oldest files until we reach target size
        while (currentSize > targetSize) {
            const oldestFile = allFiles.shift();
            if (!oldestFile) break;

            try {
                const fileSize = oldestFile.stats.size;
                await fs.unlink(oldestFile.path);
                currentSize -= fileSize;

                logger.warn(`Removed old ${oldestFile.type} file to free up space`, {
                    file: oldestFile.file,
                    size: fileSize,
                    currentSize,
                    targetSize
                });

                // If we've reached our target, compress remaining files
                if (currentSize <= targetSize) {
                    await Promise.all(
                        allFiles
                            .filter(file => file.type !== 'archive')
                            .map(file => logger.compressLog(file.path))
                    );
                }
            } catch (error) {
                logger.error('Failed to remove file', {
                    error: error.message,
                    stack: error.stack,
                    file: oldestFile.path
                });
            }
        }

        logger.info('Emergency cleanup completed', {
            finalSize: currentSize,
            targetSize: targetSize,
            filesRemoved: allFiles.length
        });

    } catch (error) {
        logger.error('Failed to perform emergency cleanup', {
            error: error.message,
            stack: error.stack
        });
    }
};

// Schedule periodic monitoring
setInterval(logger.monitorDiskUsage, CONFIG.LOGGING.CLEANUP_INTERVAL);

// Add cleanup function for old logs
logger.cleanupLogs = async () => {
    try {
        const now = Date.now();
        const cutoff = now - CONFIG.LOGGING.MAX_RETENTION;

        // Clean up all log directories
        const directories = [
            { dir: ERROR_LOG_DIR, type: 'error' },
            { dir: COMBINED_LOG_DIR, type: 'combined' },
            { dir: DAILY_DIR, type: 'daily' },
            { dir: WEEKLY_DIR, type: 'weekly' }
        ];

        for (const { dir, type } of directories) {
            const files = await fs.readdir(dir);
            for (const file of files) {
                const filePath = join(dir, file);
                const stats = await fs.stat(filePath);
                if (stats.mtimeMs < cutoff) {
                    if (type === 'error' || type === 'combined') {
                        await logger.compressLog(filePath);
                    } else {
                        await fs.unlink(filePath);
                    }
                }
            }
        }

        // Clean up old archives
        const archiveFiles = await fs.readdir(ARCHIVE_DIR);
        for (const file of archiveFiles) {
            const filePath = join(ARCHIVE_DIR, file);
            const stats = await fs.stat(filePath);
            if (stats.mtimeMs < cutoff) {
                await fs.unlink(filePath);
            }
        }

    } catch (error) {
        logger.error('Failed to clean up old logs', {
            error: error.message,
            stack: error.stack
        });
    }
};

// Schedule periodic cleanup
setInterval(logger.cleanupLogs, CONFIG.LOGGING.CLEANUP_INTERVAL);
