/**
 * Unit tests for sendRepresentativeRejectionEmail
 * Verifies the representative rejection email function behavior.
 */

jest.mock('../../server/middleware/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Resend before requiring emailService (match Resend SDK: { data, error })
const mockResendSuccess = () => ({
  id: 'test-id',
  data: { id: 'test-id' },
  error: null,
});

const mockSend = jest.fn().mockResolvedValue(mockResendSuccess());
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

// Mock config
jest.mock('../../server/config', () => ({
  RESEND_API_KEY: 'test-key',
  RESEND_FROM_EMAIL: 'noreply@test.com',
  RESEND_FROM_NAME: 'Colabora',
  FRONTEND_URL: 'http://localhost:3001',
  NODE_ENV: 'test'
}));

describe('sendRepresentativeRejectionEmail', () => {
  let emailService;

  beforeAll(() => {
    emailService = require('../../server/modules/emailService');
  });

  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockResolvedValue(mockResendSuccess());
  });

  test('should send rejection email for organization vote', async () => {
    const params = {
      toEmail: 'proposer@example.com',
      proposerName: 'Alice',
      representativeName: 'Bob',
      itemTitle: 'Open document for amendments',
      itemType: 'organization_vote',
      reason: 'The document is not ready for amendments at this time.'
    };

    const result = await emailService.sendRepresentativeRejectionEmail(params);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe(params.toEmail);
    expect(call.subject).toContain('vote');
    expect(call.html).toContain(params.itemTitle);
    expect(call.html).toContain(params.representativeName);
    expect(call.html).toContain(params.reason);
    expect(call.text).toContain(params.reason);
    expect(result).toHaveProperty('id');
  });

  test('should send rejection email for rule proposal', async () => {
    const params = {
      toEmail: 'member@example.com',
      proposerName: 'Charlie',
      representativeName: 'Diana',
      itemTitle: 'Change voting threshold',
      itemType: 'rule_proposal',
      reason: 'This change requires more discussion.'
    };

    const result = await emailService.sendRepresentativeRejectionEmail(params);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe(params.toEmail);
    expect(call.subject).toContain('rule proposal');
    expect(call.html).toContain(params.itemTitle);
    expect(call.html).toContain(params.representativeName);
    expect(call.html).toContain(params.reason);
    expect(result).toHaveProperty('id');
  });

  test('should surface Resend API errors without throwing secondary TypeErrors', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Domain not verified' },
    });

    await expect(
      emailService.sendRepresentativeRejectionEmail({
        toEmail: 'test@example.com',
        proposerName: 'Test',
        representativeName: 'Rep',
        itemTitle: 'Test Vote',
        itemType: 'organization_vote',
        reason: 'Not ready',
      })
    ).rejects.toThrow('Resend API error: Domain not verified');
  });

  test('should escape HTML in reason', async () => {
    const params = {
      toEmail: 'test@example.com',
      proposerName: 'Test',
      representativeName: 'Rep',
      itemTitle: 'Test Vote',
      itemType: 'organization_vote',
      reason: '<script>alert("xss")</script>Reason with <b>tags</b>'
    };

    await emailService.sendRepresentativeRejectionEmail(params);

    const call = mockSend.mock.calls[0][0];
    expect(call.html).not.toContain('<script>');
    expect(call.html).toContain('&lt;script&gt;');
    expect(call.html).toContain('&lt;b&gt;');
  });
});
