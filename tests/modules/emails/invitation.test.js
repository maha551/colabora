const invitation = require('../../../server/emails/templates/invitation');

describe('invitation email template', () => {
  test('render includes register link and subject', () => {
    const content = invitation.render({
      email: 'user@example.com',
      organizationName: 'Test Org',
      invitationToken: 'abc123',
      inviterName: 'Alice',
      invitationType: 'member',
      locale: 'en',
      org: { name: 'Test Org' },
    });
    expect(content.subject).toContain('Test Org');
    expect(content.htmlContent).toContain('/register?token=');
    expect(content.htmlContent).toContain('abc123');
    expect(content.textContent).toContain('Accept invitation');
    expect(content.htmlContent).not.toContain('undefined');
  });
});
