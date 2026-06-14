const DocumentScheduler = require('../../server/modules/scheduler');
const { getTestKnex } = require('../utils/db-cleanup');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let db;
let scheduler;

describe('Scheduler Jobs Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
    db = getTestKnex();

    scheduler = new DocumentScheduler(db);
  });

  afterAll(async () => {
    if (scheduler) {
      scheduler.stop();
    }

    await safeDeleteTestDatabase();
  });

  test('should start scheduler successfully', () => {
    expect(() => {
      scheduler.start();
    }).not.toThrow();

    expect(scheduler.isRunning).toBe(true);
  });

  test('should stop scheduler successfully', () => {
    scheduler.start();
    scheduler.stop();

    expect(scheduler.isRunning).toBe(false);
  });

  test('should check proposal deadlines', async () => {
    scheduler.start();

    expect(typeof scheduler.checkProposalDeadlines).toBe('function');

    await expect(scheduler.checkProposalDeadlines()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should check voting deadlines', async () => {
    scheduler.start();

    expect(typeof scheduler.checkVotingDeadlines).toBe('function');
    await expect(scheduler.checkVotingDeadlines()).resolves.not.toThrow();
    await expect(scheduler.checkSchedulingPollParticipationDeadlines()).resolves.not.toThrow();
    await expect(scheduler.checkSchedulingPollReminders()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should process expired documents', async () => {
    scheduler.start();

    expect(typeof scheduler.processExpiredDocuments).toBe('function');
    await expect(scheduler.processExpiredDocuments()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should check proposal cutoff', async () => {
    scheduler.start();

    expect(typeof scheduler.checkProposalCutoff).toBe('function');
    await expect(scheduler.checkProposalCutoff()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should check deletion deadlines', async () => {
    scheduler.start();

    expect(typeof scheduler.checkDeletionDeadlines).toBe('function');
    await expect(scheduler.checkDeletionDeadlines()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should process expired rule proposals', async () => {
    scheduler.start();

    expect(typeof scheduler.processExpiredRuleProposals).toBe('function');
    await expect(scheduler.processExpiredRuleProposals()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should send deadlines approaching digests', async () => {
    scheduler.start();

    expect(typeof scheduler.sendDeadlinesApproachingDigests).toBe('function');
    await expect(scheduler.sendDeadlinesApproachingDigests()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should send digest emails', async () => {
    scheduler.start();

    expect(typeof scheduler.sendDigestEmails).toBe('function');
    await expect(scheduler.sendDigestEmails()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should check term expirations', async () => {
    scheduler.start();

    expect(typeof scheduler.checkTermExpirations).toBe('function');
    await expect(scheduler.checkTermExpirations()).resolves.not.toThrow();

    scheduler.stop();
  });

  test('should handle errors gracefully', async () => {
    scheduler.start();

    await expect(scheduler.checkProposalDeadlines()).resolves.not.toThrow();
    await expect(scheduler.checkVotingDeadlines()).resolves.not.toThrow();
    await expect(scheduler.checkSchedulingPollParticipationDeadlines()).resolves.not.toThrow();
    await expect(scheduler.checkSchedulingPollReminders()).resolves.not.toThrow();
    await expect(scheduler.checkProposalCutoff()).resolves.not.toThrow();
    await expect(scheduler.checkDeletionDeadlines()).resolves.not.toThrow();
    await expect(scheduler.processExpiredRuleProposals()).resolves.not.toThrow();

    scheduler.stop();
  });
});
