/**
 * Full-text search indexing for paragraphs and meetings (with full protocol content).
 */

exports.up = async function up(knex) {
  // --- Paragraph search vector ---
  await knex.raw(`
    ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.paragraphs_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.search_vector := to_tsvector(
        'english',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.text, '')
      );
      RETURN NEW;
    END;
    $$;
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS paragraphs_search_vector_update ON paragraphs;
    CREATE TRIGGER paragraphs_search_vector_update
      BEFORE INSERT OR UPDATE OF title, text ON paragraphs
      FOR EACH ROW EXECUTE FUNCTION public.paragraphs_search_vector_update();
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_paragraphs_search_vector
      ON paragraphs USING gin (search_vector);
  `);

  await knex.raw(`
    UPDATE paragraphs
    SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(text, ''))
    WHERE search_vector IS NULL;
  `);

  // --- Meeting search text + vector ---
  await knex.raw(`
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS search_text text;
    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.refresh_meeting_search_vector(p_meeting_id text) RETURNS void
    LANGUAGE plpgsql AS $$
    DECLARE
      v_search_text text;
      v_doc_id text;
    BEGIN
      SELECT minutes_document_id INTO v_doc_id FROM meetings WHERE id = p_meeting_id;
      IF NOT FOUND THEN
        RETURN;
      END IF;

      SELECT trim(both from concat_ws(' ',
        (SELECT concat_ws(' ', COALESCE(title, ''), COALESCE(location, ''))
           FROM meetings WHERE id = p_meeting_id),
        (SELECT string_agg(title, ' ')
           FROM meeting_agenda_items WHERE meeting_id = p_meeting_id),
        (SELECT string_agg(concat_ws(' ', title, COALESCE(description, '')), ' ')
           FROM meeting_todos WHERE meeting_id = p_meeting_id),
        (SELECT string_agg(concat_ws(' ', COALESCE(title, ''), COALESCE(text, '')), ' ')
           FROM meeting_decisions WHERE meeting_id = p_meeting_id),
        (SELECT string_agg(title, ' ')
           FROM meeting_votes WHERE meeting_id = p_meeting_id),
        (SELECT string_agg(mvo.label, ' ')
           FROM meeting_vote_options mvo
           JOIN meeting_votes mv ON mvo.meeting_vote_id = mv.id
          WHERE mv.meeting_id = p_meeting_id),
        (SELECT string_agg(label, ' ')
           FROM meeting_brainstorm_options WHERE meeting_id = p_meeting_id),
        CASE
          WHEN v_doc_id IS NOT NULL THEN (
            SELECT string_agg(concat_ws(' ', COALESCE(p.title, ''), COALESCE(p.text, '')), ' ')
              FROM paragraphs p WHERE p.document_id = v_doc_id
          )
          ELSE NULL
        END,
        (SELECT string_agg(
           concat_ws(' ',
             COALESCE((payload::jsonb)->>'title', ''),
             COALESCE((payload::jsonb)->>'text', ''),
             COALESCE((payload::jsonb)->>'label', ''),
             COALESCE((payload::jsonb)->>'description', ''),
             COALESCE((payload::jsonb)->>'topic', ''),
             COALESCE((payload::jsonb)->>'agendaItemTitle', ''),
             COALESCE((payload::jsonb)->>'documentTitle', '')
           ),
           ' '
         )
           FROM meeting_minutes_events
          WHERE meeting_id = p_meeting_id
            AND payload IS NOT NULL
            AND payload <> ''
            AND payload ~ '^[\\[{]')
      )) INTO v_search_text;

      UPDATE meetings
      SET search_text = COALESCE(v_search_text, ''),
          search_vector = to_tsvector('english', COALESCE(v_search_text, ''))
      WHERE id = p_meeting_id;
    END;
    $$;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.trigger_refresh_meeting_search() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      v_meeting_id text;
    BEGIN
      IF TG_TABLE_NAME = 'meetings' THEN
        v_meeting_id := COALESCE(NEW.id, OLD.id);
      ELSIF TG_TABLE_NAME = 'meeting_vote_options' THEN
        SELECT meeting_id INTO v_meeting_id
          FROM meeting_votes
         WHERE id = COALESCE(NEW.meeting_vote_id, OLD.meeting_vote_id);
      ELSIF TG_TABLE_NAME = 'paragraphs' THEN
        SELECT id INTO v_meeting_id
          FROM meetings
         WHERE minutes_document_id = COALESCE(NEW.document_id, OLD.document_id);
      ELSE
        v_meeting_id := COALESCE(NEW.meeting_id, OLD.meeting_id);
      END IF;

      IF v_meeting_id IS NOT NULL THEN
        PERFORM public.refresh_meeting_search_vector(v_meeting_id);
      END IF;

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $$;
  `);

  const meetingTriggerTables = [
    { table: 'meetings', events: 'INSERT OR UPDATE OF title, location, minutes_document_id' },
    { table: 'meeting_agenda_items', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_todos', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_decisions', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_votes', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_vote_options', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_brainstorm_options', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'meeting_minutes_events', events: 'INSERT OR UPDATE OR DELETE' },
    { table: 'paragraphs', events: 'INSERT OR UPDATE OF title, text OR DELETE' },
  ];

  for (const { table, events } of meetingTriggerTables) {
    const triggerName = `refresh_meeting_search_on_${table}`;
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table};`);
    await knex.raw(`
      CREATE TRIGGER ${triggerName}
        AFTER ${events} ON ${table}
        FOR EACH ROW EXECUTE FUNCTION public.trigger_refresh_meeting_search();
    `);
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_meetings_search_vector
      ON meetings USING gin (search_vector);
  `);

  await knex.raw(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN SELECT id FROM meetings LOOP
        PERFORM public.refresh_meeting_search_vector(r.id);
      END LOOP;
    END;
    $$;
  `);
};

exports.down = async function down(knex) {
  const meetingTriggerTables = [
    'meetings',
    'meeting_agenda_items',
    'meeting_todos',
    'meeting_decisions',
    'meeting_votes',
    'meeting_vote_options',
    'meeting_brainstorm_options',
    'meeting_minutes_events',
    'paragraphs',
  ];

  for (const table of meetingTriggerTables) {
    await knex.raw(`DROP TRIGGER IF EXISTS refresh_meeting_search_on_${table} ON ${table};`);
  }

  await knex.raw('DROP FUNCTION IF EXISTS public.trigger_refresh_meeting_search() CASCADE;');
  await knex.raw('DROP FUNCTION IF EXISTS public.refresh_meeting_search_vector(text) CASCADE;');
  await knex.raw('DROP TRIGGER IF EXISTS paragraphs_search_vector_update ON paragraphs;');
  await knex.raw('DROP FUNCTION IF EXISTS public.paragraphs_search_vector_update() CASCADE;');
  await knex.raw('DROP INDEX IF EXISTS idx_meetings_search_vector;');
  await knex.raw('DROP INDEX IF EXISTS idx_paragraphs_search_vector;');
  await knex.raw('ALTER TABLE meetings DROP COLUMN IF EXISTS search_vector;');
  await knex.raw('ALTER TABLE meetings DROP COLUMN IF EXISTS search_text;');
  await knex.raw('ALTER TABLE paragraphs DROP COLUMN IF EXISTS search_vector;');
};
