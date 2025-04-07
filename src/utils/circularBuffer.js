class CircularBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.items = new Array(maxSize);
        this.currentIndex = 0;
        this.isFull = false;
    }

    push(item) {
        this.items[this.currentIndex] = item;
        this.currentIndex = (this.currentIndex + 1) % this.maxSize;
        if (this.currentIndex === 0) {
            this.isFull = true;
        }
    }

    getItems() {
        if (!this.isFull) {
            return this.items.slice(0, this.currentIndex);
        }

        // If buffer is full, reconstruct items in chronological order
        const items = new Array(this.maxSize);
        for (let i = 0; i < this.maxSize; i++) {
            items[i] = this.items[(this.currentIndex + i) % this.maxSize];
        }
        return items.filter(item => item !== undefined);
    }

    clear() {
        this.items = new Array(this.maxSize);
        this.currentIndex = 0;
        this.isFull = false;
    }

    getSize() {
        return this.isFull ? this.maxSize : this.currentIndex;
    }

    getMaxSize() {
        return this.maxSize;
    }

    // Get items within a specific time window
    getItemsInWindow(startTime, endTime) {
        return this.getItems().filter(item => 
            item && item.timestamp >= startTime && item.timestamp <= endTime
        );
    }

    // Get the latest N items
    getLatestItems(n) {
        const items = this.getItems();
        return items.slice(Math.max(items.length - n, 0));
    }

    // Calculate average for a numeric field in the items
    calculateAverage(field) {
        const items = this.getItems();
        if (items.length === 0) return 0;

        const sum = items.reduce((acc, item) => {
            return acc + (item && item[field] ? item[field] : 0);
        }, 0);

        return sum / items.length;
    }

    // Calculate percentile for a numeric field
    calculatePercentile(field, percentile) {
        const items = this.getItems()
            .filter(item => item && item[field] !== undefined)
            .map(item => item[field])
            .sort((a, b) => a - b);

        if (items.length === 0) return 0;

        const index = Math.ceil((percentile / 100) * items.length) - 1;
        return items[Math.max(0, Math.min(index, items.length - 1))];
    }

    // Get statistics for a numeric field
    getFieldStats(field) {
        const items = this.getItems().filter(item => item && item[field] !== undefined);
        if (items.length === 0) {
            return {
                min: 0,
                max: 0,
                avg: 0,
                median: 0,
                p95: 0,
                p99: 0,
                count: 0
            };
        }

        const values = items.map(item => item[field]);
        const sorted = [...values].sort((a, b) => a - b);

        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            median: this.calculatePercentile(field, 50),
            p95: this.calculatePercentile(field, 95),
            p99: this.calculatePercentile(field, 99),
            count: values.length
        };
    }
}

export { CircularBuffer };
