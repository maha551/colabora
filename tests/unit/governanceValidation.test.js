/**
 * Tests for Governance Validation Middleware
 * Tests Task 1: Backend Validation feature
 */

const request = require('supertest');
const express = require('express');
const { validateRuleProposal, validateRuleProposalMetadata } = require('../../server/middleware/governanceValidation');

describe('Governance Validation Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Mock user for authentication
    app.use((req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    });
  });

  describe('validateRuleProposalMetadata', () => {
    it('should reject missing title', (done) => {
      app.post('/test', validateRuleProposalMetadata, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ description: 'Test description' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details[0].field).toBe('title');
        })
        .end(done);
    });

    it('should reject empty title', (done) => {
      app.post('/test', validateRuleProposalMetadata, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ title: '   ' })
        .expect(400)
        .end(done);
    });

    it('should reject title longer than 200 characters', (done) => {
      app.post('/test', validateRuleProposalMetadata, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ title: 'a'.repeat(201) })
        .expect(400)
        .end(done);
    });

    it('should reject description longer than 2000 characters', (done) => {
      app.post('/test', validateRuleProposalMetadata, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ title: 'Valid Title', description: 'a'.repeat(2001) })
        .expect(400)
        .end(done);
    });

    it('should accept valid title and description', (done) => {
      app.post('/test', validateRuleProposalMetadata, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ title: 'Valid Title', description: 'Valid description' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        })
        .end(done);
    });
  });

  describe('validateRuleProposal', () => {
    it('should reject missing ruleField', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ proposedValue: 75 })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details[0].field).toBe('ruleField');
        })
        .end(done);
    });

    it('should reject missing proposedValue', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'defaultAcceptanceThreshold' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details[0].field).toBe('proposedValue');
        })
        .end(done);
    });

    it('should reject invalid percentage (negative)', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'defaultAcceptanceThreshold', proposedValue: -10 })
        .expect(400)
        .end(done);
    });

    it('should reject invalid percentage (>100)', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'defaultAcceptanceThreshold', proposedValue: 150 })
        .expect(400)
        .end(done);
    });

    it('should reject invalid integer (negative)', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'representativeTermMonths', proposedValue: -5 })
        .expect(400)
        .end(done);
    });

    it('should reject invalid integer (non-integer)', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'representativeTermMonths', proposedValue: 5.5 })
        .expect(400)
        .end(done);
    });

    it('should reject invalid boolean', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'anonymousVotingEnabled', proposedValue: 'true' })
        .expect(400)
        .end(done);
    });

    it('should reject invalid enum value', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'electionVotingMethod', proposedValue: 'invalid_method' })
        .expect(400)
        .end(done);
    });

    it('should accept valid percentage (0-100)', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'defaultAcceptanceThreshold', proposedValue: 75 })
        .expect(200)
        .end(done);
    });

    it('should accept valid integer', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'representativeTermMonths', proposedValue: 12 })
        .expect(200)
        .end(done);
    });

    it('should accept valid boolean', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'anonymousVotingEnabled', proposedValue: true })
        .expect(200)
        .end(done);
    });

    it('should accept valid enum value', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({ ruleField: 'electionVotingMethod', proposedValue: 'simple_majority' })
        .expect(200)
        .end(done);
    });

    it('should validate options array', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({
          ruleField: 'defaultAcceptanceThreshold',
          proposedValue: 75,
          options: [
            { optionTitle: 'Option 1', proposedValue: 50 },
            { optionTitle: 'Option 2', proposedValue: 75 }
          ]
        })
        .expect(200)
        .end(done);
    });

    it('should reject empty options array', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({
          ruleField: 'defaultAcceptanceThreshold',
          proposedValue: 75,
          options: []
        })
        .expect(400)
        .end(done);
    });

    it('should reject option with missing title', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({
          ruleField: 'defaultAcceptanceThreshold',
          proposedValue: 75,
          options: [
            { proposedValue: 50 }
          ]
        })
        .expect(400)
        .end(done);
    });

    it('should reject option with invalid proposedValue', (done) => {
      app.post('/test', validateRuleProposal, (req, res) => {
        res.json({ success: true });
      });

      request(app)
        .post('/test')
        .send({
          ruleField: 'defaultAcceptanceThreshold',
          proposedValue: 75,
          options: [
            { optionTitle: 'Option 1', proposedValue: 150 }
          ]
        })
        .expect(400)
        .end(done);
    });
  });
});

