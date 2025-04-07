import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.watchers = new Map();
        this.validators = new Map();
        this.defaults = new Map();
        this.configPath = path.join(__dirname, '..', 'config');
    }

    /**
     * Initialize configuration system
     */
    async initialize() {
        // Ensure config directory exists
        await fs.mkdir(this.configPath, { recursive: true });

        // Register default configurations
        this.registerDefaults();

        // Load all configurations
        await this.loadAllConfigs();

        // Start watching for changes
        this.startFileWatchers();
    }

    /**
     * Register default configurations
     */
    registerDefaults() {
        // Bot configuration
        this.setDefaults('bot', {
            prefix: '!',
            language: 'en',
            timezone: 'UTC',
            maxConcurrentCommands: 10,
            commandTimeout: 30000,
            cooldowns: {
                global: 1000,
                user: 2000,
                channel: 1000
            }
        });

        // Game configuration
        this.setDefaults('games', {
            maxActivePlayers: 100,
            maxGamesPerChannel: 5,
            timeouts: {
                turn: 30000,
                game: 300000
            },
            rewards: {
                win: 100,
                participation: 10
            }
        });

        // Resource limits
        this.setDefaults('resources', {
            memory: {
                warningThreshold: 0.7,
                criticalThreshold: 0.85
            },
            cpu: {
                warningThreshold: 0.7,
                criticalThreshold: 0.85
            },
            storage: {
                warningThreshold: 0.8,
                criticalThreshold: 0.9
            }
        });

        // Cache configuration
        this.setDefaults('cache', {
            defaultTTL: 3600000,
            checkInterval: 300000,
            maxSize: {
                memory: 1000,
                disk: 10000
            }
        });
    }

    /**
     * Set default values for a configuration
     */
    setDefaults(name, defaults) {
        this.defaults.set(name, defaults);
    }

    /**
     * Register a configuration validator
     */
    registerValidator(name, validator) {
        this.validators.set(name, validator);
    }

    /**
     * Load all configuration files
     */
    async loadAllConfigs() {
        try {
            const files = await fs.readdir(this.configPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const name = path.basename(file, '.json');
                    await this.loadConfig(name);
                }
            }
        } catch (error) {
            logger.log('error', 'Failed to load configurations', { error: error.message });
        }
    }

    /**
     * Load a specific configuration
     */
    async loadConfig(name) {
        const configPath = path.join(this.configPath, `${name}.json`);
        
        try {
            const data = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(data);

            // Apply defaults
            const defaults = this.defaults.get(name) || {};
            const merged = this.mergeConfigs(defaults, config);

            // Validate configuration
            const validator = this.validators.get(name);
            if (validator) {
                const { valid, errors } = validator(merged);
                if (!valid) {
                    logger.log('error', 'Invalid configuration', { name, errors });
                    return;
                }
            }

            this.configs.set(name, merged);
            logger.log('info', `Loaded configuration: ${name}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Create default configuration
                const defaults = this.defaults.get(name);
                if (defaults) {
                    await this.saveConfig(name, defaults);
                    this.configs.set(name, defaults);
                    logger.log('info', `Created default configuration: ${name}`);
                }
            } else {
                logger.log('error', `Failed to load configuration: ${name}`, { error: error.message });
            }
        }
    }

    /**
     * Save a configuration
     */
    async saveConfig(name, config) {
        const configPath = path.join(this.configPath, `${name}.json`);
        
        try {
            // Validate configuration
            const validator = this.validators.get(name);
            if (validator) {
                const { valid, errors } = validator(config);
                if (!valid) {
                    throw new Error(`Invalid configuration: ${errors.join(', ')}`);
                }
            }

            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            this.configs.set(name, config);
            logger.log('info', `Saved configuration: ${name}`);
        } catch (error) {
            logger.log('error', `Failed to save configuration: ${name}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Get a configuration value
     */
    get(name, key = null) {
        const config = this.configs.get(name);
        if (!config) return null;

        if (key) {
            return key.split('.').reduce((obj, k) => obj && obj[k], config);
        }

        return config;
    }

    /**
     * Update a configuration value
     */
    async update(name, updates, options = {}) {
        const current = this.configs.get(name) || {};
        const updated = this.mergeConfigs(current, updates);

        // Validate if specified
        if (options.validate) {
            const validator = this.validators.get(name);
            if (validator) {
                const { valid, errors } = validator(updated);
                if (!valid) {
                    throw new Error(`Invalid configuration: ${errors.join(', ')}`);
                }
            }
        }

        // Save if specified
        if (options.save) {
            await this.saveConfig(name, updated);
        } else {
            this.configs.set(name, updated);
        }

        return updated;
    }

    /**
     * Merge configurations recursively
     */
    mergeConfigs(base, override) {
        const merged = { ...base };

        for (const [key, value] of Object.entries(override)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                merged[key] = this.mergeConfigs(merged[key] || {}, value);
            } else {
                merged[key] = value;
            }
        }

        return merged;
    }

    /**
     * Start watching configuration files for changes
     */
    startFileWatchers() {
        const watcher = fs.watch(this.configPath, async (eventType, filename) => {
            if (!filename || !filename.endsWith('.json')) return;

            const name = path.basename(filename, '.json');
            if (eventType === 'change') {
                await this.loadConfig(name);
                logger.log('info', `Reloaded configuration: ${name}`);
            }
        });

        watcher.on('error', error => {
            logger.log('error', 'Configuration watcher error', { error: error.message });
        });
    }

    /**
     * Get all configuration names
     */
    getConfigNames() {
        return Array.from(this.configs.keys());
    }

    /**
     * Check if a configuration exists
     */
    hasConfig(name) {
        return this.configs.has(name);
    }

    /**
     * Delete a configuration
     */
    async deleteConfig(name) {
        const configPath = path.join(this.configPath, `${name}.json`);
        
        try {
            await fs.unlink(configPath);
            this.configs.delete(name);
            logger.log('info', `Deleted configuration: ${name}`);
        } catch (error) {
            logger.log('error', `Failed to delete configuration: ${name}`, { error: error.message });
            throw error;
        }
    }
}

export default new ConfigManager();
