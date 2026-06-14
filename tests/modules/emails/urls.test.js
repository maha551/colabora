const urls = require('../../../server/emails/urls');

describe('email urls', () => {
  test('document uses hash route', () => {
    expect(urls.document('doc-1')).toMatch(/\/#document\/doc-1$/);
  });

  test('orgTab uses hash route', () => {
    expect(urls.orgTab('org-1', 'governance')).toMatch(/\/#\/organization\/org-1\/governance$/);
  });

  test('activity and settings use hash routes', () => {
    expect(urls.activity()).toMatch(/\/#\/activity$/);
    expect(urls.settings()).toMatch(/\/#\/settings$/);
  });

  test('register and resetPassword use pathname routes', () => {
    expect(urls.register('tok', 'a@b.com')).toMatch(/\/register\?token=/);
    expect(urls.register('tok', 'a@b.com')).not.toContain('#');
    expect(urls.resetPassword('tok')).toMatch(/\/reset-password\?token=/);
    expect(urls.resetPassword('tok')).not.toContain('#');
  });

  test('withUtm adds campaign params', () => {
    const url = urls.withUtm(urls.activity(), 'weekly_digest');
    expect(url).toContain('utm_source=transactional');
    expect(url).toContain('utm_campaign=weekly_digest');
  });
});
