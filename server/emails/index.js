const invitation = require('./templates/invitation');
const documentInvitation = require('./templates/documentInvitation');
const welcome = require('./templates/welcome');
const firstUserWelcome = require('./templates/firstUserWelcome');
const passwordReset = require('./templates/passwordReset');
const deadlineReminder = require('./templates/deadlineReminder');
const votingStarted = require('./templates/votingStarted');
const activityDigest = require('./templates/activityDigest');
const deadlinesDigest = require('./templates/deadlinesDigest');
const representativeRejection = require('./templates/representativeRejection');
const schedulingPollParticipationClosed = require('./templates/schedulingPollParticipationClosed');

module.exports = {
  invitation,
  documentInvitation,
  welcome,
  firstUserWelcome,
  passwordReset,
  deadlineReminder,
  votingStarted,
  activityDigest,
  deadlinesDigest,
  representativeRejection,
  schedulingPollParticipationClosed,
  urls: require('./urls'),
  branding: require('./branding'),
  i18n: require('./i18n'),
};
