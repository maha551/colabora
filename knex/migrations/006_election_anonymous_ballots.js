/**
 * Allow anonymous election ballots to store candidate IDs / ranked-choice JSON,
 * not only yes/no/abstain policy vote literals.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE anonymous_vote_ballots
    DROP CONSTRAINT IF EXISTS anonymous_vote_ballots_vote_choice_check;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE anonymous_vote_ballots
    ADD CONSTRAINT anonymous_vote_ballots_vote_choice_check
    CHECK (vote_choice = ANY (ARRAY['yes'::text, 'no'::text, 'abstain'::text]));
  `);
};
