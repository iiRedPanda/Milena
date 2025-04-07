class Container {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.factories = new Map();
        this.decorators = new Map();
    }

    /**
     * Register a service
     * @param {string} name - Service name
     * @param {Function} constructor - Service constructor
     * @param {Object} options - Registration options
     */
    register(name, constructor, options = {}) {
        const {
            singleton = false,
            dependencies = [],
            decorators = [],
            lazy = false
        } = options;

        const registration = {
            constructor,
            dependencies,
            decorators,
            singleton,
            lazy
        };

        this.services.set(name, registration);
    }

    /**
     * Register a factory function
     * @param {string} name - Factory name
     * @param {Function} factory - Factory function
     */
    registerFactory(name, factory) {
        this.factories.set(name, factory);
    }

    /**
     * Register a decorator
     * @param {string} name - Decorator name
     * @param {Function} decorator - Decorator function
     */
    registerDecorator(name, decorator) {
        this.decorators.set(name, decorator);
    }

    /**
     * Get a service instance
     * @param {string} name - Service name
     * @returns {Object} Service instance
     */
    get(name) {
        // Check if it's a singleton and already instantiated
        if (this.singletons.has(name)) {
            return this.singletons.get(name);
        }

        // Get service registration
        const registration = this.services.get(name);
        if (!registration) {
            throw new Error(`Service not found: ${name}`);
        }

        // Get factory if exists
        const factory = this.factories.get(name);
        if (factory) {
            const instance = factory(this);
            if (registration.singleton) {
                this.singletons.set(name, instance);
            }
            return instance;
        }

        // Resolve dependencies
        const dependencies = registration.dependencies.map(dep => this.get(dep));

        // Create instance
        let instance = new registration.constructor(...dependencies);

        // Apply decorators
        for (const decoratorName of registration.decorators) {
            const decorator = this.decorators.get(decoratorName);
            if (decorator) {
                instance = decorator(instance, this);
            }
        }

        // Store singleton if needed
        if (registration.singleton) {
            this.singletons.set(name, instance);
        }

        return instance;
    }

    /**
     * Check if a service exists
     * @param {string} name - Service name
     * @returns {boolean} True if service exists
     */
    has(name) {
        return this.services.has(name) || this.factories.has(name);
    }

    /**
     * Remove a service
     * @param {string} name - Service name
     */
    remove(name) {
        this.services.delete(name);
        this.singletons.delete(name);
        this.factories.delete(name);
    }

    /**
     * Clear all services
     */
    clear() {
        this.services.clear();
        this.singletons.clear();
        this.factories.clear();
        this.decorators.clear();
    }

    /**
     * Create a child container
     * @returns {Container} Child container
     */
    createChild() {
        const child = new Container();
        
        // Copy registrations
        this.services.forEach((registration, name) => {
            child.services.set(name, { ...registration });
        });

        this.factories.forEach((factory, name) => {
            child.factories.set(name, factory);
        });

        this.decorators.forEach((decorator, name) => {
            child.decorators.set(name, decorator);
        });

        return child;
    }

    /**
     * Register common service types
     */
    registerCommonServices() {
        // Register logger
        this.register('logger', require('./logger').default, {
            singleton: true
        });

        // Register cache
        this.register('cache', require('./cache').default, {
            singleton: true,
            dependencies: ['logger']
        });

        // Register performance monitor
        this.register('performance', require('./performance').default, {
            singleton: true,
            dependencies: ['logger']
        });

        // Register error handler
        this.register('errorHandler', require('./errorHandler').default, {
            singleton: true,
            dependencies: ['logger', 'performance']
        });

        // Register analytics
        this.register('analytics', require('./analytics').default, {
            singleton: true,
            dependencies: ['logger', 'cache']
        });

        // Register resource manager
        this.register('resourceManager', require('./resourceManager').default, {
            singleton: true,
            dependencies: ['logger', 'analytics']
        });
    }
}

// Create and export default container
const container = new Container();
container.registerCommonServices();

export default container;
