/**
 * Prune old memory entries from the given memory object.
 * @param {Object} memory - The memory object containing channel-specific histories.
 */
async function pruneOldMemory(memory) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour in milliseconds
    for (const channelId in memory) {
        memory[channelId] = memory[channelId].filter(entry => entry.timestamp >= oneHourAgo);
    }
}

module.exports = { pruneOldMemory };
