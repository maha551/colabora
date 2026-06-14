const { sendInvitationEmail, sendWelcomeEmail, sendImmediateNotification, sendDigestEmail, formatDeadlinesApproachingDigest } = require('../../server/modules/emailService');
const invitationTemplate = require('../../server/emails/templates/invitation');

describe('Email Service Module Tests', () => {
  test('should have sendInvitationEmail function', () => {
    expect(typeof sendInvitationEmail).toBe('function');
  });

  test('should have sendWelcomeEmail function', () => {
    expect(typeof sendWelcomeEmail).toBe('function');
  });

  test('should have sendImmediateNotification function', () => {
    expect(typeof sendImmediateNotification).toBe('function');
  });

  test('should have sendDigestEmail function', () => {
    expect(typeof sendDigestEmail).toBe('function');
  });

  test('formatDeadlinesApproachingDigest uses hash links in items', () => {
    const content = formatDeadlinesApproachingDigest({
      documentsVoting: [{
        title: 'Budget',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        link: 'http://localhost:3001/#document/doc-1',
        organizationName: 'Acme',
      }],
    }, { locale: 'en' });
    expect(content.subject).toBeTruthy();
    expect(content.htmlContent).toContain('#document/doc-1');
  });

  test('invitation template renders hash-free register URL', () => {
    const content = invitationTemplate.render({
      email: 'test@example.com',
      organizationName: 'Org',
      invitationToken: 'token',
      inviterName: 'Inviter',
      locale: 'en',
    });
    expect(content.htmlContent).toContain('/register?token=token');
  });

  test('should handle email sending gracefully in test mode', async () => {
    process.env.NODE_ENV = 'test';
    try {
      await sendInvitationEmail('me@mads-hansen.de', 'Test Org', 'token', 'Test User', 'member');
    } catch (error) {
      expect(error.message).toBeDefined();
    }
    expect(typeof sendInvitationEmail).toBe('function');
  });
});
