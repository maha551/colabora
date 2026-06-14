/**
 * Notification channel adapters — require each channel module to register at load time.
 */

require('./emailChannel');
require('./webPushChannel');
require('./telegramChannel');

module.exports = {
  ...require('./registry'),
  ...require('./dispatcher'),
  ...require('./channelPreferences'),
};
