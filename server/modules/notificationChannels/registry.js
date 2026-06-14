/**
 * Channel adapter registry — channels register at module load time.
 */

/** @type {Map<string, import('./types').ChannelAdapter>} */
const channels = new Map();

/**
 * @param {import('./types').ChannelAdapter} adapter
 */
function registerChannel(adapter) {
  if (!adapter || !adapter.id) {
    throw new Error('Channel adapter must have an id');
  }
  channels.set(adapter.id, adapter);
}

/**
 * @param {import('./types').ChannelId} id
 * @returns {import('./types').ChannelAdapter|undefined}
 */
function getChannel(id) {
  return channels.get(id);
}

/**
 * @returns {import('./types').ChannelAdapter[]}
 */
function getAllChannels() {
  return Array.from(channels.values());
}

/**
 * @returns {import('./types').ChannelAdapter[]}
 */
function getConfiguredChannels() {
  return getAllChannels().filter((channel) => {
    try {
      return channel.isConfigured();
    } catch {
      return false;
    }
  });
}

/**
 * Clear all registered channels (for tests).
 */
function clearChannels() {
  channels.clear();
}

module.exports = {
  registerChannel,
  getChannel,
  getAllChannels,
  getConfiguredChannels,
  clearChannels,
};
