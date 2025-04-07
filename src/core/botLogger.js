import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logBaseFolder = path.join(__dirname, 'logs');

// Create log folders asynchronously
async function initializeLogFolders() {
    try {
        await fs.mkdir(logBaseFolder, { recursive: true });
        const categories = ['api', 'debug', 'error', 'info', 'runtime', 'message'];
        await Promise.all(categories.map(category => 
            fs.mkdir(path.join(logBaseFolder, category), { recursive: true })
        ));
    } catch (error) {
        console.error('Failed to create log folders:', error);
    }
}

// Initialize folders
initializeLogFolders();

// Cache open file handles
const fileHandles = new Map();

function getFormattedTimestamp() {
    return new Date().toISOString();
}

async function getLogFileHandle(category) {
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(logBaseFolder, category.toLowerCase(), `${date}.log`);
    
    if (!fileHandles.has(filePath)) {
        const handle = await fs.open(filePath, 'a');
        fileHandles.set(filePath, handle);
        
        // Close handle after 1 hour of inactivity
        setTimeout(async () => {
            if (fileHandles.has(filePath)) {
                const handle = fileHandles.get(filePath);
                await handle.close();
                fileHandles.delete(filePath);
            }
        }, 3600000);
    }
    
    return fileHandles.get(filePath);
}

export async function log(category, message, meta = {}) {
    try {
        const timestamp = getFormattedTimestamp();
        const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
        const logMessage = `[${timestamp}] [${category.toUpperCase()}] ${message}${metaString}\n`;

        const fileHandle = await getLogFileHandle(category);
        await fileHandle.appendFile(logMessage);
    } catch (error) {
        console.error('Logging error:', error);
        const errorHandle = await getLogFileHandle('error');
        await errorHandle.appendFile(
            `[${getFormattedTimestamp()}] [ERROR] Failed to write log: ${error.message}\n`
        );
    }
}

export async function logError(type, error, meta = {}) {
    const errorMeta = {
        ...meta,
        stack: error.stack,
        name: error.name
    };
    await log('error', `${type} ${error.message}`, errorMeta);
}

// Cleanup function to close all file handles
export async function cleanup() {
    for (const handle of fileHandles.values()) {
        await handle.close();
    }
    fileHandles.clear();
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
