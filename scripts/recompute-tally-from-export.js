#!/usr/bin/env node
/**
 * Verifier script: recompute tally from ballot export and compare to announced result.
 * Implements TALLY_SPEC.md §5.1. Uses server/utils/tallyVerifier.js for recompute and compare.
 *
 * Usage:
 *   File mode:  node scripts/recompute-tally-from-export.js <path-to-export.json>
 *   API mode:   node scripts/recompute-tally-from-export.js --api-url=<baseURL> --token=<JWT> --vote-type=<type> --contest-id=<id>
 *
 * Exit codes: 0 = match or no announcedResult to compare; 1 = mismatch or error.
 */

const fs = require('fs');
const path = require('path');
const { recomputeTallyFromBallots, compareTally } = require('../server/utils/tallyVerifier');

function parseArgs(argv) {
  const args = { filePath: null, apiUrl: null, token: null, voteType: null, contestId: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--api-url=')) args.apiUrl = arg.slice('--api-url='.length).trim();
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length).trim();
    else if (arg.startsWith('--vote-type=')) args.voteType = arg.slice('--vote-type='.length).trim();
    else if (arg.startsWith('--contest-id=')) args.contestId = arg.slice('--contest-id='.length).trim();
    else if (!arg.startsWith('--')) args.filePath = arg;
  }
  return args;
}

async function fetchExportFromApi(apiUrl, token, voteType, contestId) {
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/api/verification/ballots?voteType=${encodeURIComponent(voteType)}&contestId=${encodeURIComponent(contestId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    const err = new Error('Unauthorized (401). Check token.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (res.status === 403) {
    const err = new Error('Contest not closed (403). Ballot export only available after voting has ended.');
    err.code = 'CONTEST_NOT_CLOSED';
    throw err;
  }
  if (res.status === 404) {
    const err = new Error('Contest not found (404).');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
    err.code = 'HTTP_ERROR';
    throw err;
  }
  const data = await res.json();
  return data;
}

function runVerifier(data) {
  const ballots = data.ballots;
  const announcedResult = data.announcedResult;
  const contestId = data.contestId;
  const voteType = data.voteType;

  console.log('Recompute tally from ballot export');
  console.log('contestId:', contestId);
  console.log('voteType:', voteType);
  console.log('ballots count:', Array.isArray(ballots) ? ballots.length : 0);
  console.log('');

  const computed = recomputeTallyFromBallots(ballots);
  console.log('Computed counts:', computed);

  const comparison = compareTally(computed, announcedResult);
  if (announcedResult && typeof announcedResult === 'object') {
    console.log('Announced result:', announcedResult);
    console.log(comparison.match ? 'Match: YES' : 'Match: NO');
    if (!comparison.match && comparison.diff) {
      console.log('Diff:', comparison.diff);
      return 1;
    }
  } else {
    console.log('No announcedResult in export; no comparison.');
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv);
  let data;

  if (args.apiUrl && args.token && args.voteType && args.contestId) {
    try {
      data = await fetchExportFromApi(args.apiUrl, args.token, args.voteType, args.contestId);
    } catch (e) {
      console.error('API fetch failed:', e.message);
      if (e.code) console.error('Code:', e.code);
      process.exit(1);
    }
  } else if (args.filePath) {
    const resolved = path.resolve(process.cwd(), args.filePath);
    if (!fs.existsSync(resolved)) {
      console.error('File not found:', resolved);
      process.exit(1);
    }
    try {
      data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch (e) {
      console.error('Invalid JSON:', e.message);
      process.exit(1);
    }
  } else {
    console.error('Usage:');
    console.error('  File mode:  node scripts/recompute-tally-from-export.js <path-to-export.json>');
    console.error('  API mode:   node scripts/recompute-tally-from-export.js --api-url=<baseURL> --token=<JWT> --vote-type=<type> --contest-id=<id>');
    process.exit(1);
  }

  const exitCode = runVerifier(data);
  process.exit(exitCode);
}

main();
