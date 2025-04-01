const rateLimit = new Map();

function isRateLimited(userId) {
    // ... (rate limiting logic)
}

// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) {
            rateLimit.delete(userId);
        }
    }
}, 10000);

module.exports = { isRateLimited };