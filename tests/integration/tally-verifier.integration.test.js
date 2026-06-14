/**
 * Integration tests for tally verifier (Agent E).
 * Tests recompute + compare with fixture export; script exit codes when run as subprocess.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const {
  recomputeTallyFromBallots,
  compareTally
} = require('../../server/utils/tallyVerifier');

const FIXTURE_PATH = path.join(__dirname, '../../scripts/fixture-export.json');

describe('Tally verifier integration', () => {
  describe('recompute and compare with fixture', () => {
    test('fixture export: recompute matches announcedResult', () => {
      const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
      const data = JSON.parse(raw);
      const computed = recomputeTallyFromBallots(data.ballots);
      expect(computed).toEqual(data.announcedResult);
      const comparison = compareTally(computed, data.announcedResult);
      expect(comparison.match).toBe(true);
    });

    test('tampered announcedResult: compare returns match false and diff', () => {
      const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
      const data = JSON.parse(raw);
      const computed = recomputeTallyFromBallots(data.ballots);
      const tampered = { pro: 0, contra: 0, neutral: 0, total: 99 };
      const comparison = compareTally(computed, tampered);
      expect(comparison.match).toBe(false);
      expect(comparison.diff).toEqual({ pro: 2, contra: 1, neutral: 0, total: -96 });
    });
  });

  describe('verifier script (subprocess)', () => {
    const scriptPath = path.join(__dirname, '../../scripts/recompute-tally-from-export.js');
    const node = process.execPath;

    test('script with fixture file: Match YES, exit 0', () => {
      const result = spawnSync(node, [scriptPath, FIXTURE_PATH], {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 10000
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Match: YES');
    });

    test('script with tampered file: Match NO, exit 1', () => {
      const tampered = {
        contestId: 'test',
        voteType: 'paragraph',
        ballots: [
          { contestId: 'test', choice: 'PRO', createdAt: '2025-01-01T12:00:00.000Z' },
          { contestId: 'test', choice: 'CONTRA', createdAt: '2025-01-01T12:01:00.000Z' }
        ],
        announcedResult: { pro: 99, contra: 99, neutral: 99, total: 99 }
      };
      const tmpPath = path.join(__dirname, '../../scripts/fixture-tampered-verifier-test.json');
      fs.writeFileSync(tmpPath, JSON.stringify(tampered), 'utf8');
      try {
        const result = spawnSync(node, [scriptPath, tmpPath], {
          cwd: path.join(__dirname, '../..'),
          encoding: 'utf8',
          timeout: 10000
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('Match: NO');
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    });
  });
});
