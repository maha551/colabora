const { Resend } = require('resend');
const config = require('../config');
const { logger } = require('../middleware/logger');
const emailTemplates = require('../emails');
const { resolveAppBranding } = require('../emails/branding');
const urls = require('../emails/urls');

let resend = null;
if (config.RESEND_API_KEY) {
  resend = new Resend(config.RESEND_API_KEY);
} else {
  logger.warn('RESEND_API_KEY not configured. Email service will not work.');
}

function formatFromAddress(branding) {
  const fromEmail = config.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = branding?.fromName || config.RESEND_FROM_NAME || 'Colabora';
  return `${fromName} <${fromEmail}>`;
}

function buildResendErrorMessage(error) {
  if (!error) {
    return 'Unknown error sending email';
  }

  let errorMessage = error.message || 'Unknown error sending email';
  if (error.response) {
    errorMessage = `Resend API error (${error.response.status}): ${error.response.data?.message || error.message || 'Unknown error sending email'}`;
  }
  if (errorMessage.includes('only send testing emails to your own email address') ||
      errorMessage.includes('verify a domain')) {
    errorMessage = `Resend Testing Mode Restriction: ${errorMessage}. To send to other recipients, verify a domain at resend.com/domains and set RESEND_FROM_EMAIL.`;
  }
  return errorMessage;
}

function formatResendApiError(errorPayload) {
  if (!errorPayload) {
    return 'Unknown error sending email';
  }
  if (typeof errorPayload === 'string') {
    return errorPayload;
  }
  return errorPayload.message || JSON.stringify(errorPayload);
}

async function sendEmailPayload({ to, subject, html, text, branding, headers }) {
  const from = formatFromAddress(branding || resolveAppBranding());
  const payload = { from, to, subject, html, text };
  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }
  const result = await resend.emails.send(payload);
  if (!result) {
    throw new Error('Resend API returned no response');
  }
  if (result.error) {
    throw new Error(`Resend API error: ${formatResendApiError(result.error)}`);
  }
  return result;
}

function requireResendOrDev(logType, devLogFn) {
  if (resend) return true;
  if (config.NODE_ENV === 'development') {
    devLogFn();
    return false;
  }
  return null;
}

async function sendInvitationEmail(email, organizationName, invitationToken, inviterName, invitationType = 'member', options = {}) {
  const invitationLink = urls.register(invitationToken, email);
  const devResult = requireResendOrDev('invitation', () => {
    logger.info('INVITATION EMAIL (DEVELOPMENT MODE)', {
      to: email, organization: organizationName, inviter: inviterName, type: invitationType, invitationLink,
    });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) {
    throw new Error('Resend email service is not configured. Please set RESEND_API_KEY.');
  }

  const content = emailTemplates.invitation.render({
    email,
    organizationName,
    invitationToken,
    inviterName,
    invitationType,
    locale: options.locale || 'en',
    org: options.org || { name: organizationName, ...options.branding },
  });

  try {
    const branding = emailTemplates.branding.resolveOrgBranding(options.org || { name: organizationName });
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding,
    });
    logger.info('Invitation email sent successfully', { email, organizationName, invitationType, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    const errorMessage = buildResendErrorMessage(error);
    logger.error('Failed to send invitation email', { error: errorMessage, email, organizationName, invitationType });
    throw new Error(errorMessage);
  }
}

async function sendDocumentInvitationEmail(email, documentTitle, invitationToken, inviterName, options = {}) {
  const invitationLink = urls.register(invitationToken, email, 'document');
  const devResult = requireResendOrDev('document invitation', () => {
    logger.info('DOCUMENT INVITATION EMAIL (DEVELOPMENT MODE)', { to: email, document: documentTitle, inviter: inviterName, invitationLink });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) throw new Error('Resend email service is not configured. Please set RESEND_API_KEY.');

  const content = emailTemplates.documentInvitation.render({
    email, documentTitle, invitationToken, inviterName, locale: options.locale || 'en',
  });

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
    });
    logger.info('Document invitation email sent successfully', { email, documentTitle, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    const errorMessage = buildResendErrorMessage(error);
    logger.error('Failed to send document invitation email', { error: errorMessage, email, documentTitle });
    throw new Error(errorMessage);
  }
}

async function sendWelcomeEmail(email, userName, organizationName, options = {}) {
  if (!resend) {
    logger.warn('Resend not configured, skipping welcome email');
    return;
  }

  const content = emailTemplates.welcome.render({
    userName,
    organizationName,
    locale: options.locale || 'en',
    org: options.org || { name: organizationName },
    organizationId: options.organizationId,
  });

  try {
    const branding = emailTemplates.branding.resolveOrgBranding(options.org || { name: organizationName });
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding,
    });
    logger.info('Welcome email sent successfully', { email, userName, organizationName, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    logger.error('Failed to send welcome email', { error: error.message, email, userName, organizationName });
    logger.warn('Welcome email failed but continuing');
  }
}

async function sendPasswordResetEmail(email, userName, resetToken, options = {}) {
  const resetLink = urls.resetPassword(resetToken);
  const devResult = requireResendOrDev('password reset', () => {
    logger.info('PASSWORD RESET EMAIL (DEVELOPMENT MODE)', { to: email, userName, resetLink });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) throw new Error('Resend email service is not configured. Please set RESEND_API_KEY.');

  const content = emailTemplates.passwordReset.render({
    userName, resetToken, locale: options.locale || 'en',
  });

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
    });
    logger.info('Password reset email sent successfully', { email, userName, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    const errorMessage = buildResendErrorMessage(error);
    logger.error('Failed to send password reset email', { error: errorMessage, email, userName });
    throw new Error(errorMessage);
  }
}

async function sendImmediateNotification(email, eventType, eventData, options = {}) {
  const devResult = requireResendOrDev('immediate notification', () => {
    logger.info('IMMEDIATE NOTIFICATION (DEVELOPMENT MODE)', { to: email, eventType, eventData });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) {
    logger.warn('Resend not configured, skipping immediate notification');
    return null;
  }

  let content;
  const locale = options.locale || 'en';
  if (eventType === 'voting_deadline_approaching' ||
      eventType === 'rule_proposal_deadline_approaching' ||
      eventType === 'election_deadline_approaching' ||
      eventType === 'election_nomination_deadline_approaching' ||
      eventType === 'scheduling_poll_deadline_approaching') {
    content = emailTemplates.deadlineReminder.render({ eventData, locale });
  } else if (eventType === 'voting_started' || eventType === 'scheduling_poll_opened') {
    content = emailTemplates.votingStarted.render({
      eventData: {
        ...eventData,
        votingType: eventType === 'scheduling_poll_opened' ? 'scheduling_poll' : eventData.votingType,
        votingDeadline: eventData.votingDeadline || eventData.participationDeadline,
      },
      locale,
    });
  } else if (eventType === 'scheduling_poll_participation_closed') {
    content = emailTemplates.schedulingPollParticipationClosed.render({ eventData, locale });
  } else {
    logger.warn('Unknown immediate notification event type', { eventType });
    return null;
  }

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
    });
    logger.info('Immediate notification email sent successfully', { email, eventType, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    logger.error('Failed to send immediate notification email', { error: error.message, email, eventType });
    return null;
  }
}

async function sendDigestEmail(email, digestEvents, frequency, options = {}) {
  const devResult = requireResendOrDev('digest', () => {
    logger.info('DIGEST EMAIL (DEVELOPMENT MODE)', { to: email, frequency, eventCount: digestEvents.length });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) {
    logger.warn('Resend not configured, skipping digest email');
    return null;
  }
  if (!digestEvents || digestEvents.length === 0) {
    logger.debug('No events to include in digest, skipping email');
    return null;
  }

  const content = emailTemplates.activityDigest.render({
    events: digestEvents,
    frequency,
    locale: options.locale || 'en',
  });

  const settingsUrl = urls.settings();
  const headers = {
    'List-Unsubscribe': `<${settingsUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
      headers,
    });
    logger.info('Digest email sent successfully', { email, frequency, eventCount: digestEvents.length, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    logger.error('Failed to send digest email', { error: error.message, email, frequency });
    return null;
  }
}

async function sendDeadlinesDigestEmail(email, content) {
  const devResult = requireResendOrDev('deadlines digest', () => {
    logger.info('DEADLINES DIGEST (DEVELOPMENT MODE)', { to: email, subject: content?.subject });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) {
    logger.warn('Resend not configured, skipping deadlines digest email');
    return null;
  }
  if (!content || !content.subject || !content.htmlContent) {
    logger.debug('No content to send for deadlines digest');
    return null;
  }

  const settingsUrl = urls.settings();
  const headers = {
    'List-Unsubscribe': `<${settingsUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
      headers,
    });
    logger.info('Deadlines digest email sent', { email, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    logger.error('Failed to send deadlines digest email', { error: error.message, email });
    return null;
  }
}

async function sendFirstUserWelcomeEmail(email, userName, options = {}) {
  const devResult = requireResendOrDev('first user welcome', () => {
    logger.info('FIRST USER WELCOME EMAIL (DEVELOPMENT MODE)', { to: email, userName });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) {
    logger.warn('Resend not configured, skipping first user welcome email');
    return null;
  }

  const content = emailTemplates.firstUserWelcome.render({
    userName,
    locale: options.locale || 'en',
  });

  try {
    const result = await sendEmailPayload({
      to: email,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
    });
    logger.info('First user welcome email sent successfully', { email, userName, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    const errorMessage = buildResendErrorMessage(error);
    logger.error('Failed to send first user welcome email', { error: errorMessage, email, userName });
    throw new Error(errorMessage);
  }
}

async function sendRepresentativeRejectionEmail({ toEmail, proposerName, representativeName, itemTitle, itemType, reason, locale = 'en' }) {
  const content = emailTemplates.representativeRejection.render({
    proposerName, representativeName, itemTitle, itemType, reason, locale,
  });

  const devResult = requireResendOrDev('representative rejection', () => {
    logger.info('REPRESENTATIVE REJECTION EMAIL (DEVELOPMENT MODE)', { to: toEmail, itemTitle, itemType });
  });
  if (devResult === false) return { id: 'dev-mode', data: { id: 'dev-mode' } };
  if (devResult === null) throw new Error('Resend email service is not configured. Please set RESEND_API_KEY.');

  try {
    const result = await sendEmailPayload({
      to: toEmail,
      subject: content.subject,
      html: content.htmlContent,
      text: content.textContent,
      branding: resolveAppBranding(),
    });
    logger.info('Representative rejection email sent successfully', { toEmail, itemTitle, itemType, messageId: result.id || result.data?.id });
    return result;
  } catch (error) {
    const errorMessage = buildResendErrorMessage(error);
    logger.error('Failed to send representative rejection email', { error: errorMessage, toEmail, itemTitle, itemType });
    throw new Error(errorMessage);
  }
}

function formatDeadlineReminderEmail(eventData, locale = 'en') {
  const content = emailTemplates.deadlineReminder.render({ eventData, locale });
  return { subject: content.subject, htmlContent: content.htmlContent, textContent: content.textContent };
}

function formatVotingStartedEmail(eventData, locale = 'en') {
  const content = emailTemplates.votingStarted.render({ eventData, locale });
  return { subject: content.subject, htmlContent: content.htmlContent, textContent: content.textContent };
}

function formatDeadlinesApproachingDigest(sections, options = {}) {
  return emailTemplates.deadlinesDigest.render(sections, options);
}

function formatDigestEmail(events, frequency, locale = 'en') {
  const content = emailTemplates.activityDigest.render({ events, frequency, locale });
  return { subject: content.subject, htmlContent: content.htmlContent, textContent: content.textContent };
}

async function sendContactFormEmail({ to, name, email, subject, message, userAgent, ip }) {
  const recipient = to || config.CONTACT_EMAIL || config.ADMIN_BOOTSTRAP_EMAIL;
  const safeName = String(name || '').trim();
  const safeEmail = String(email || '').trim();
  const safeSubject = String(subject || '').trim();
  const safeMessage = String(message || '').trim();

  const emailSubject = `[Colabora Contact] ${safeSubject}`;
  const textContent = [
    `Name: ${safeName}`,
    `Email: ${safeEmail}`,
    `Subject: ${safeSubject}`,
    ip ? `IP: ${ip}` : null,
    userAgent ? `User-Agent: ${userAgent}` : null,
    '',
    safeMessage,
  ].filter(Boolean).join('\n');

  const htmlContent = `
    <p><strong>Name:</strong> ${safeName}</p>
    <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    <p><strong>Subject:</strong> ${safeSubject}</p>
    ${ip ? `<p><strong>IP:</strong> ${ip}</p>` : ''}
    <hr />
    <p style="white-space: pre-wrap;">${safeMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `;

  if (!recipient) {
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      logger.info('Contact form (no recipient configured)', {
        name: safeName,
        email: safeEmail,
        subject: safeSubject,
        environment: config.NODE_ENV,
      });
      return { dev: true };
    }
    throw new Error('Contact email recipient is not configured');
  }

  if (!requireResendOrDev('contact form', () => {
    logger.info('Contact form (dev, Resend not configured)', {
      to: recipient,
      from: safeEmail,
      subject: emailSubject,
    });
  })) {
    return { dev: true };
  }

  return sendEmailPayload({
    to: recipient,
    subject: emailSubject,
    html: htmlContent,
    text: textContent,
    headers: {
      'Reply-To': safeEmail,
    },
  });
}

module.exports = {
  sendInvitationEmail,
  sendDocumentInvitationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendImmediateNotification,
  sendDigestEmail,
  sendDeadlinesDigestEmail,
  sendFirstUserWelcomeEmail,
  sendRepresentativeRejectionEmail,
  sendContactFormEmail,
  formatDeadlineReminderEmail,
  formatVotingStartedEmail,
  formatDeadlinesApproachingDigest,
  formatDigestEmail,
};
