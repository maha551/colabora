--
-- PostgreSQL database dump
--

\restrict T5dT6rsqn8gHUtzRfylNWyMW0UMWn0a07rhyQVUCpJghVNCGgOQDBfhUfkkaO99

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: documents_search_vector_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.documents_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, ''));
        RETURN NEW;
      END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anonymous_vote_ballots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anonymous_vote_ballots (
    id text NOT NULL,
    voting_session_id text NOT NULL,
    voter_token text NOT NULL,
    vote_choice text NOT NULL,
    vote_weight integer DEFAULT 1,
    voted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    vote_hash text,
    ip_address text,
    user_agent_hash text,
    receipt_id text,
    CONSTRAINT anonymous_vote_ballots_vote_choice_check CHECK ((vote_choice = ANY (ARRAY['yes'::text, 'no'::text, 'abstain'::text])))
);


--
-- Name: comment_upvotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_upvotes (
    id text NOT NULL,
    comment_id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id text NOT NULL,
    commentable_type text NOT NULL,
    commentable_id text NOT NULL,
    user_id text NOT NULL,
    text text NOT NULL,
    parent_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    edited_at timestamp without time zone,
    edit_count integer DEFAULT 0,
    upvote_count integer DEFAULT 0,
    CONSTRAINT comments_commentable_type_check CHECK ((commentable_type = ANY (ARRAY['proposal'::text, 'structure_proposal'::text, 'rule_proposal'::text])))
);


--
-- Name: document_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_collaborators (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_deletion_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_deletion_votes (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT document_deletion_votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'NEUTRAL'::text, 'CONTRA'::text])))
);


--
-- Name: document_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_invitations (
    id text NOT NULL,
    document_id text NOT NULL,
    email text NOT NULL,
    invitation_token text NOT NULL,
    invited_by text NOT NULL,
    status text DEFAULT 'pending'::text,
    expires_at timestamp without time zone NOT NULL,
    accepted_at timestamp without time zone,
    accepted_by_user_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: document_owner_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_owner_backup (
    document_id text NOT NULL,
    old_owner_id text,
    old_organization_id text,
    migrated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_status_history (
    id text NOT NULL,
    document_id text NOT NULL,
    old_status text,
    new_status text NOT NULL,
    changed_by text,
    change_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_structure_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_structure_versions (
    id text NOT NULL,
    document_id text NOT NULL,
    version_number integer NOT NULL,
    name text,
    description text,
    created_by text NOT NULL,
    structure_snapshot text NOT NULL,
    change_type text,
    related_proposal_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_structure_versions_change_type_check CHECK ((change_type = ANY (ARRAY['structure_proposal'::text, 'manual'::text, 'initial'::text])))
);


--
-- Name: document_tree_proposal_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_tree_proposal_votes (
    id text NOT NULL,
    proposal_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT document_tree_proposal_votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'NEUTRAL'::text, 'CONTRA'::text])))
);


--
-- Name: document_tree_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_tree_proposals (
    id text NOT NULL,
    document_id text NOT NULL,
    organization_id text NOT NULL,
    proposed_by_user_id text NOT NULL,
    operation_type text NOT NULL,
    target_parent_id text,
    new_order integer,
    reason text,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    voting_deadline timestamp without time zone,
    CONSTRAINT document_tree_proposals_operation_type_check CHECK ((operation_type = ANY (ARRAY['MOVE'::text, 'DELETE'::text, 'REORDER'::text]))),
    CONSTRAINT document_tree_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'applied'::text])))
);


--
-- Name: document_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_votes (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT document_votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'NEUTRAL'::text, 'CONTRA'::text])))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    owner_id text NOT NULL,
    collaborators text,
    ownership_type text DEFAULT 'personal'::text,
    creator_ids text,
    organization_id text,
    parent_id text,
    sort_order real,
    status text DEFAULT 'draft'::text,
    proposal_deadline timestamp without time zone,
    voting_deadline timestamp without time zone,
    paragraph_proposals_cutoff timestamp without time zone,
    voting_started_at timestamp without time zone,
    min_voters_required integer DEFAULT 0,
    adopted_at timestamp without time zone,
    deletion_proposed_at timestamp without time zone,
    deletion_proposed_by text,
    deletion_vote_deadline timestamp without time zone,
    status_deadline timestamp without time zone,
    deadline_extensions integer DEFAULT 0,
    max_extensions integer DEFAULT 3,
    hierarchy_level integer DEFAULT 1,
    acceptance_threshold real DEFAULT 75.0 NOT NULL,
    voting_anonymous boolean DEFAULT false NOT NULL,
    voting_anonymity_locked boolean DEFAULT false NOT NULL,
    vote_change_allowed boolean DEFAULT true NOT NULL,
    structure_proposals_enabled boolean DEFAULT false NOT NULL,
    amendments_open integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    amendments_opened_at timestamp without time zone,
    search_vector tsvector,
    document_kind text DEFAULT 'standard'::text,
    meeting_id text,
    CONSTRAINT documents_check CHECK ((((ownership_type = 'organizational'::text) AND (owner_id = organization_id) AND (organization_id IS NOT NULL)) OR ((ownership_type <> 'organizational'::text) AND (owner_id IS NOT NULL) AND (organization_id IS NULL)))),
    CONSTRAINT documents_hierarchy_level_check CHECK (((hierarchy_level >= 1) AND (hierarchy_level <= 3))),
    CONSTRAINT documents_ownership_type_check CHECK ((ownership_type = ANY (ARRAY['personal'::text, 'shared'::text, 'organizational'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['proposal'::text, 'draft'::text, 'agreed'::text, 'voting'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: election_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.election_candidates (
    id text NOT NULL,
    election_id text NOT NULL,
    user_id text NOT NULL,
    candidate_statement text,
    accepted_nomination boolean DEFAULT false,
    nominated_by text,
    nomination_accepted_at timestamp without time zone,
    votes_received integer DEFAULT 0,
    elected boolean DEFAULT false,
    elected_position integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: election_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.election_votes (
    id text NOT NULL,
    election_id text NOT NULL,
    candidate_id text,
    user_id text NOT NULL,
    anonymous_token text,
    vote_rank integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: error_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_reports (
    id text NOT NULL,
    user_id text,
    user_email text,
    title text NOT NULL,
    description text NOT NULL,
    error_message text,
    error_stack text,
    url text,
    user_agent text,
    browser_info text,
    screen_resolution text,
    console_logs text,
    screenshot_url text,
    status text DEFAULT 'new'::text,
    priority text DEFAULT 'medium'::text,
    assigned_to text,
    resolution_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone,
    CONSTRAINT error_reports_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT error_reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: governance_rule_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_rule_history (
    id text NOT NULL,
    organization_id text NOT NULL,
    rule_field text NOT NULL,
    old_value text,
    new_value text,
    changed_by_proposal_id text,
    changed_by_user_id text,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: governance_rule_proposal_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_rule_proposal_options (
    id text NOT NULL,
    proposal_id text NOT NULL,
    option_title text NOT NULL,
    option_description text,
    proposed_value text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    votes_received integer DEFAULT 0
);


--
-- Name: governance_rule_proposal_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_rule_proposal_votes (
    id text NOT NULL,
    proposal_id text NOT NULL,
    user_id text NOT NULL,
    selected_option_id text,
    vote text,
    voted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT governance_rule_proposal_votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'NEUTRAL'::text, 'CONTRA'::text])))
);


--
-- Name: governance_rule_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_rule_proposals (
    id text NOT NULL,
    organization_id text NOT NULL,
    title text NOT NULL,
    description text,
    current_rule_field text NOT NULL,
    current_rule_value text,
    proposed_rule_value text NOT NULL,
    status text DEFAULT 'draft'::text,
    voting_starts_at timestamp without time zone,
    voting_ends_at timestamp without time zone,
    threshold_percentage real DEFAULT 75.0,
    anonymous_voting boolean DEFAULT true,
    votes_yes integer DEFAULT 0,
    votes_no integer DEFAULT 0,
    votes_abstain integer DEFAULT 0,
    total_voters integer DEFAULT 0,
    votes_cast integer DEFAULT 0,
    created_by text NOT NULL,
    approved_at timestamp without time zone,
    implemented_at timestamp without time zone,
    snapshot_rules text,
    cooldown_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    rejected_by_rep_id text,
    rejection_reason text,
    rejected_at timestamp without time zone,
    CONSTRAINT governance_rule_proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.history (
    id text NOT NULL,
    paragraph_id text NOT NULL,
    proposal_id text NOT NULL,
    user_id text NOT NULL,
    old_text text,
    new_text text NOT NULL,
    approval_percentage real NOT NULL,
    heading_level text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    accepted_at timestamp without time zone
);


--
-- Name: meeting_agenda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_agenda_items (
    id text NOT NULL,
    meeting_id text NOT NULL,
    title text NOT NULL,
    order_index real NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    created_by_user_id text
);


--
-- Name: meeting_brainstorm_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_brainstorm_options (
    id text NOT NULL,
    meeting_id text NOT NULL,
    brainstorm_event_id text NOT NULL,
    label text NOT NULL,
    created_by_user_id text,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: meeting_minutes_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_minutes_events (
    id text NOT NULL,
    meeting_id text NOT NULL,
    minutes_document_id text NOT NULL,
    event_type text NOT NULL,
    payload text,
    order_index real NOT NULL,
    created_at timestamp without time zone NOT NULL,
    created_by_user_id text
);


--
-- Name: meeting_moderators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_moderators (
    id text NOT NULL,
    meeting_id text NOT NULL,
    user_id text NOT NULL,
    source text NOT NULL,
    invited_by_user_id text,
    created_at timestamp without time zone NOT NULL,
    CONSTRAINT meeting_moderators_source_check CHECK ((source = ANY (ARRAY['creator'::text, 'representative'::text, 'invited'::text])))
);


--
-- Name: meeting_todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_todos (
    id text NOT NULL,
    meeting_id text NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp without time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    responsible_user_id text NOT NULL,
    agenda_item_id text,
    order_index real NOT NULL,
    created_at timestamp without time zone NOT NULL,
    created_by_user_id text,
    completed_at timestamp without time zone,
    completed_by_user_id text
);


--
-- Name: meeting_vote_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_vote_options (
    id text NOT NULL,
    meeting_vote_id text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: meeting_vote_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_vote_responses (
    id text NOT NULL,
    meeting_vote_id text NOT NULL,
    option_id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: meeting_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_votes (
    id text NOT NULL,
    meeting_id text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    anonymous integer DEFAULT 0,
    created_by_user_id text NOT NULL,
    created_at timestamp without time zone NOT NULL,
    closed_at timestamp without time zone,
    source_event_id text,
    CONSTRAINT meeting_votes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id text NOT NULL,
    organization_id text NOT NULL,
    title text NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    end_at timestamp without time zone,
    location text,
    meeting_link text,
    meeting_provider text,
    created_by_user_id text NOT NULL,
    created_from_scheduling_poll_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    minutes_document_id text,
    minutes_finalized_at timestamp without time zone,
    current_agenda_item_id text
);


--
-- Name: member_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_locations (
    id text NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    city text NOT NULL,
    region text,
    country_code text NOT NULL,
    latitude real NOT NULL,
    longitude real NOT NULL,
    source text NOT NULL,
    show_on_map boolean DEFAULT true NOT NULL,
    location_updated_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    CONSTRAINT member_locations_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'auto'::text])))
);


--
-- Name: migration_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_history (
    id text NOT NULL,
    migration_name text NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms integer,
    success boolean DEFAULT true,
    error_message text
);


--
-- Name: notification_digest_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_digest_queue (
    id text NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    event_data text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id text NOT NULL,
    email_enabled boolean DEFAULT true,
    immediate_notifications_enabled boolean DEFAULT true,
    digest_frequency text DEFAULT 'monthly'::text,
    digest_last_sent timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deadline_digest_last_sent timestamp without time zone,
    CONSTRAINT notification_preferences_digest_frequency_check CHECK ((digest_frequency = ANY (ARRAY['weekly'::text, 'monthly'::text, 'off'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: organization_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_audit (
    id text NOT NULL,
    organization_id text NOT NULL,
    action_type text,
    performed_by_user_id text NOT NULL,
    affected_user_id text,
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organization_audit_action_type_check CHECK ((action_type = ANY (ARRAY['org_created'::text, 'rep_added'::text, 'rep_removed'::text, 'rep_removal_failed'::text, 'member_invited'::text, 'member_joined'::text, 'member_left'::text, 'member_bulk_added'::text, 'member_bulk_invited'::text, 'member_added'::text, 'org_updated'::text, 'invitation_accepted'::text, 'invitation_resent'::text, 'vote_declined'::text, 'rep_removed_via_mistrust_vote'::text, 'vote_proposed'::text, 'vote_approved'::text, 'vote_started'::text, 'vote_completed'::text, 'doc_created'::text, 'dissolution_proposed'::text, 'org_dissolved'::text, 'bootstrap_completed'::text, 'rule_proposal_created'::text, 'rule_proposal_voting_started'::text, 'rule_proposal_declined'::text, 'rule_proposal_rejected_conflict'::text, 'rule_proposal_approved'::text, 'rule_proposal_rejected'::text, 'rule_proposal_expired'::text, 'governance_rules_updated'::text, 'election_created'::text, 'election_started'::text, 'election_phase_updated'::text, 'election_phase_forced'::text, 'election_auto_scheduled'::text, 'election_completed'::text, 'rep_resignation_pending'::text, 'rep_resignation_finalized'::text, 'mistrust_vote_initiated'::text, 'structure_proposal_approved'::text, 'structure_proposal_rejected'::text, 'tree_proposal_approved'::text, 'tree_proposal_rejected'::text, 'tree_proposal_applied'::text, 'document_status_agreed'::text, 'document_status_rejected'::text])))
);


--
-- Name: organization_governance_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_governance_rules (
    id text NOT NULL,
    organization_id text NOT NULL,
    representative_term_months integer DEFAULT 12,
    representative_term_limits integer,
    election_voting_method text DEFAULT 'simple_majority'::text,
    election_quorum_percentage real DEFAULT 0.5,
    election_notice_days integer DEFAULT 14,
    default_voting_deadline_hours integer DEFAULT 168,
    default_quorum_percentage real DEFAULT 0.5,
    document_proposal_period_days integer DEFAULT 365,
    paragraph_proposal_cutoff_days integer DEFAULT 7,
    threshold_calculation_method text DEFAULT 'all_members'::text,
    default_acceptance_threshold real DEFAULT 75.0,
    anonymous_voting_enabled boolean DEFAULT true,
    vote_change_allowed boolean DEFAULT false,
    default_structure_proposals_enabled boolean DEFAULT true,
    default_voting_anonymity_locked boolean DEFAULT false,
    representative_can_create_votes boolean DEFAULT true,
    representative_can_invite_members boolean DEFAULT true,
    representative_can_manage_documents boolean DEFAULT true,
    representative_approval_required boolean DEFAULT true,
    tamper_proof_enabled boolean DEFAULT true,
    audit_trail_enabled boolean DEFAULT true,
    members_can_propose_rules boolean DEFAULT false,
    members_can_propose_rules_threshold real DEFAULT 0.5,
    members_can_create_documents boolean DEFAULT false,
    members_can_create_documents_threshold real DEFAULT 0.5,
    members_can_initialize_elections boolean DEFAULT false,
    members_can_initialize_elections_threshold real DEFAULT 0.5,
    members_can_invite_members boolean DEFAULT false,
    members_can_invite_members_threshold real DEFAULT 0.5,
    members_can_manage_rule_proposals boolean DEFAULT false,
    members_can_manage_rule_proposals_threshold real DEFAULT 0.5,
    minimum_quorum_percentage real DEFAULT 0.1,
    minimum_approval_threshold real DEFAULT 0.5,
    minimum_voting_period_hours integer DEFAULT 24,
    bootstrap_mode boolean DEFAULT true,
    bootstrap_completed_at timestamp without time zone,
    recovery_mode boolean DEFAULT false,
    recovery_mode_entered_at timestamp without time zone,
    recovery_mode_reason text,
    last_successful_vote_at timestamp without time zone,
    failed_proposals_count integer DEFAULT 0,
    last_failed_proposal_at timestamp without time zone,
    rule_changes_this_month integer DEFAULT 0,
    last_rule_change_at timestamp without time zone,
    members_can_initiate_mistrust_vote boolean DEFAULT false,
    mistrust_vote_threshold real DEFAULT 75.0,
    mistrust_vote_quorum_percentage real DEFAULT 0.5,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organization_governance_rule_threshold_calculation_method_check CHECK ((threshold_calculation_method = ANY (ARRAY['all_votes'::text, 'all_members'::text]))),
    CONSTRAINT organization_governance_rules_election_voting_method_check CHECK ((election_voting_method = ANY (ARRAY['simple_majority'::text, 'ranked_choice'::text, 'approval'::text])))
);


--
-- Name: organization_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invitations (
    id text NOT NULL,
    organization_id text NOT NULL,
    email text NOT NULL,
    invitation_token text NOT NULL,
    invitation_type text DEFAULT 'member'::text,
    invited_by text NOT NULL,
    status text DEFAULT 'pending'::text,
    expires_at timestamp without time zone NOT NULL,
    accepted_at timestamp without time zone,
    accepted_by_user_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organization_invitations_invitation_type_check CHECK ((invitation_type = ANY (ARRAY['member'::text, 'representative'::text]))),
    CONSTRAINT organization_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    status text DEFAULT 'active'::text,
    invited_by_rep_id text,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    left_at timestamp without time zone,
    CONSTRAINT organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'legacy'::text, 'suspended'::text])))
);


--
-- Name: organization_representatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_representatives (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    status text DEFAULT 'active'::text,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    removed_at timestamp without time zone,
    CONSTRAINT organization_representatives_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'removed'::text])))
);


--
-- Name: organization_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_votes (
    id text NOT NULL,
    organization_id text NOT NULL,
    title text NOT NULL,
    description text,
    vote_type text NOT NULL,
    proposed_by_user_id text NOT NULL,
    approved_by_rep_id text,
    threshold real DEFAULT 75.0,
    status text DEFAULT 'proposed'::text,
    voting_starts_at timestamp without time zone,
    voting_ends_at timestamp without time zone,
    target_document_id text,
    result_yes integer DEFAULT 0,
    result_no integer DEFAULT 0,
    result_abstain integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    rejected_by_rep_id text,
    rejection_reason text,
    rejected_at timestamp without time zone,
    CONSTRAINT organization_votes_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'voting'::text, 'passed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT organization_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['policy'::text, 'document_change'::text, 'membership'::text, 'dissolution'::text, 'other'::text, 'representative_removal'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    representatives text NOT NULL,
    membership_policy text DEFAULT 'invitation'::text,
    voting_enabled boolean DEFAULT false,
    voting_threshold real DEFAULT 0.5,
    is_active boolean DEFAULT true,
    created_by_admin_id text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    branding_color text,
    branding_logo_url text,
    branding_title text,
    branding_banner_url text,
    icon_set text,
    font_family text,
    CONSTRAINT organizations_membership_policy_check CHECK ((membership_policy = ANY (ARRAY['open'::text, 'invitation'::text])))
);


--
-- Name: paragraphs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paragraphs (
    id text NOT NULL,
    document_id text NOT NULL,
    title text,
    heading_level text,
    text text NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: policy_vote_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_vote_responses (
    id text NOT NULL,
    policy_vote_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    voted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT policy_vote_responses_vote_check CHECK ((vote = ANY (ARRAY['yes'::text, 'no'::text, 'abstain'::text])))
);


--
-- Name: policy_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_votes (
    id text NOT NULL,
    organization_id text NOT NULL,
    title text NOT NULL,
    description text,
    document_id text,
    status text DEFAULT 'draft'::text,
    threshold_percentage real DEFAULT 50.0,
    deadline_at timestamp without time zone,
    anonymous_voting boolean DEFAULT false,
    votes_yes integer DEFAULT 0,
    votes_no integer DEFAULT 0,
    votes_abstain integer DEFAULT 0,
    created_by text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT policy_votes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id text NOT NULL,
    paragraph_id text NOT NULL,
    user_id text NOT NULL,
    text text NOT NULL,
    type text DEFAULT 'BODY'::text,
    heading_level text,
    approved boolean DEFAULT false,
    invalidated boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT proposals_type_check CHECK ((type = ANY (ARRAY['BODY'::text, 'TITLE'::text])))
);


--
-- Name: representative_elections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.representative_elections (
    id text NOT NULL,
    organization_id text NOT NULL,
    election_title text NOT NULL,
    election_description text,
    status text DEFAULT 'draft'::text,
    positions_available integer NOT NULL,
    term_start_date timestamp without time zone,
    term_end_date timestamp without time zone,
    nomination_starts_at timestamp without time zone,
    nomination_ends_at timestamp without time zone,
    voting_starts_at timestamp without time zone,
    voting_ends_at timestamp without time zone,
    quorum_required integer,
    anonymous_voting boolean DEFAULT true,
    total_voters integer DEFAULT 0,
    votes_cast integer DEFAULT 0,
    quorum_met boolean DEFAULT false,
    election_completed_at timestamp without time zone,
    created_by text NOT NULL,
    trigger_type text DEFAULT 'manual'::text,
    triggered_by_term_id text,
    auto_advance_phases boolean DEFAULT true,
    phase_transition_in_progress boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT representative_elections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'nomination'::text, 'voting'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT representative_elections_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'resignation'::text, 'term_expiration'::text, 'auto_scheduled'::text])))
);


--
-- Name: representative_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.representative_terms (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    term_number integer NOT NULL,
    elected_in_election_id text,
    term_start_date timestamp without time zone NOT NULL,
    term_end_date timestamp without time zone NOT NULL,
    term_status text DEFAULT 'active'::text,
    removed_by text,
    removed_at timestamp without time zone,
    removal_reason text,
    resigned_at timestamp without time zone,
    resignation_pending boolean DEFAULT false,
    replacement_election_id text,
    resignation_requested_at timestamp without time zone,
    failed_election_attempts integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT representative_terms_term_status_check CHECK ((term_status = ANY (ARRAY['active'::text, 'completed'::text, 'removed'::text, 'resigned'::text])))
);


--
-- Name: scheduling_poll_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_poll_responses (
    id text NOT NULL,
    slot_id text NOT NULL,
    user_id text NOT NULL,
    response text NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    CONSTRAINT scheduling_poll_responses_response_check CHECK ((response = ANY (ARRAY['yes'::text, 'no'::text, 'maybe'::text])))
);


--
-- Name: scheduling_poll_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_poll_slots (
    id text NOT NULL,
    scheduling_poll_id text NOT NULL,
    start_at timestamp without time zone NOT NULL,
    end_at timestamp without time zone NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: scheduling_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_polls (
    id text NOT NULL,
    organization_id text NOT NULL,
    created_by_user_id text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text,
    chosen_slot_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    CONSTRAINT scheduling_polls_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'finalized'::text])))
);


--
-- Name: structure_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.structure_change_log (
    id text NOT NULL,
    document_id text NOT NULL,
    version_id text NOT NULL,
    operation_type text NOT NULL,
    paragraph_id text,
    old_data text,
    new_data text,
    operation_metadata text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: structure_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.structure_operations (
    id text NOT NULL,
    structure_proposal_id text NOT NULL,
    operation_type text NOT NULL,
    source_paragraph_ids text,
    target_paragraph_id text,
    new_position_index integer,
    new_parent_id text,
    new_text text,
    new_heading_level text,
    operation_data text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT structure_operations_operation_type_check CHECK ((operation_type = ANY (ARRAY['MOVE'::text, 'MERGE'::text, 'SPLIT'::text, 'DELETE'::text, 'RENAME_HEADING'::text, 'CHANGE_HEADING_LEVEL'::text, 'INSERT_NEW'::text])))
);


--
-- Name: structure_proposal_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.structure_proposal_votes (
    id text NOT NULL,
    structure_proposal_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT structure_proposal_votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'CONTRA'::text, 'NEUTRAL'::text])))
);


--
-- Name: structure_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.structure_proposals (
    id text NOT NULL,
    document_id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text,
    approved boolean DEFAULT false,
    applied boolean DEFAULT false,
    changes text,
    voting_deadline timestamp without time zone,
    acceptance_threshold real DEFAULT 75.0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT structure_proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    avatar text,
    bio text,
    role text DEFAULT 'user'::text,
    default_home_view text DEFAULT 'activity'::text,
    preferences text DEFAULT '{}'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: vote_ballots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_ballots (
    id text NOT NULL,
    vote_id text NOT NULL,
    user_id text NOT NULL,
    membership_status text DEFAULT 'active'::text,
    vote_choice text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT vote_ballots_vote_choice_check CHECK ((vote_choice = ANY (ARRAY['yes'::text, 'no'::text, 'abstain'::text])))
);


--
-- Name: vote_verification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_verification_log (
    id text NOT NULL,
    sequence_index integer NOT NULL,
    previous_entry_hash text NOT NULL,
    vote_type text NOT NULL,
    contest_id text NOT NULL,
    choice text NOT NULL,
    "timestamp" text NOT NULL,
    vote_hash text,
    receipt_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vote_verification_log_vote_type CHECK ((vote_type = ANY (ARRAY['paragraph'::text, 'document'::text, 'document_deletion'::text, 'document_tree'::text, 'structure'::text, 'governance_rule'::text, 'organization'::text, 'representative_election'::text])))
);


--
-- Name: voter_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voter_tokens (
    id text NOT NULL,
    voting_session_id text NOT NULL,
    user_id text NOT NULL,
    anonymous_token text NOT NULL,
    token_issued_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    token_used boolean DEFAULT false,
    token_used_at timestamp without time zone
);


--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    id text NOT NULL,
    proposal_id text NOT NULL,
    user_id text NOT NULL,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    receipt_id text,
    vote_hash text,
    CONSTRAINT votes_vote_check CHECK ((vote = ANY (ARRAY['PRO'::text, 'NEUTRAL'::text, 'CONTRA'::text])))
);


--
-- Name: voting_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voting_analytics (
    id text NOT NULL,
    organization_id text NOT NULL,
    period_start text NOT NULL,
    period_end text NOT NULL,
    total_members integer DEFAULT 0,
    active_voters integer DEFAULT 0,
    total_votes_cast integer DEFAULT 0,
    average_votes_per_member real DEFAULT 0,
    elections_held integer DEFAULT 0,
    average_election_turnout real DEFAULT 0,
    quorum_achieved_percentage real DEFAULT 0,
    total_decisions_made integer DEFAULT 0,
    decisions_passed integer DEFAULT 0,
    decisions_failed integer DEFAULT 0,
    average_decision_time_hours real DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: voting_session_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voting_session_votes (
    id text NOT NULL,
    voting_session_id text NOT NULL,
    user_id text,
    anonymous_token text,
    vote text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT voting_session_votes_vote_check CHECK ((vote = ANY (ARRAY['yes'::text, 'no'::text, 'abstain'::text])))
);


--
-- Name: voting_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voting_sessions (
    id text NOT NULL,
    organization_id text NOT NULL,
    session_type text NOT NULL,
    related_entity_id text,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text,
    anonymous_voting boolean DEFAULT true,
    deadline_hours integer DEFAULT 168,
    quorum_percentage real DEFAULT 0.5,
    required_majority real DEFAULT 0.5,
    voting_starts_at timestamp without time zone,
    voting_ends_at timestamp without time zone,
    announced_at timestamp without time zone,
    completed_at timestamp without time zone,
    eligible_voters_count integer DEFAULT 0,
    votes_cast_count integer DEFAULT 0,
    quorum_met boolean DEFAULT false,
    yes_votes integer DEFAULT 0,
    no_votes integer DEFAULT 0,
    abstain_votes integer DEFAULT 0,
    result text,
    created_by text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT voting_sessions_result_check CHECK ((result = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'tied'::text, 'quorum_not_met'::text, 'cancelled'::text]))),
    CONSTRAINT voting_sessions_session_type_check CHECK ((session_type = ANY (ARRAY['election'::text, 'policy'::text, 'document'::text, 'membership'::text, 'dissolution'::text, 'other'::text]))),
    CONSTRAINT voting_sessions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'announced'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: anonymous_vote_ballots anonymous_vote_ballots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_vote_ballots
    ADD CONSTRAINT anonymous_vote_ballots_pkey PRIMARY KEY (id);


--
-- Name: anonymous_vote_ballots anonymous_vote_ballots_voting_session_id_voter_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_vote_ballots
    ADD CONSTRAINT anonymous_vote_ballots_voting_session_id_voter_token_key UNIQUE (voting_session_id, voter_token);


--
-- Name: comment_upvotes comment_upvotes_comment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_upvotes
    ADD CONSTRAINT comment_upvotes_comment_id_user_id_key UNIQUE (comment_id, user_id);


--
-- Name: comment_upvotes comment_upvotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_upvotes
    ADD CONSTRAINT comment_upvotes_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: document_collaborators document_collaborators_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_collaborators
    ADD CONSTRAINT document_collaborators_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: document_collaborators document_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_collaborators
    ADD CONSTRAINT document_collaborators_pkey PRIMARY KEY (id);


--
-- Name: document_deletion_votes document_deletion_votes_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_deletion_votes
    ADD CONSTRAINT document_deletion_votes_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: document_deletion_votes document_deletion_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_deletion_votes
    ADD CONSTRAINT document_deletion_votes_pkey PRIMARY KEY (id);


--
-- Name: document_invitations document_invitations_invitation_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_invitations
    ADD CONSTRAINT document_invitations_invitation_token_key UNIQUE (invitation_token);


--
-- Name: document_invitations document_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_invitations
    ADD CONSTRAINT document_invitations_pkey PRIMARY KEY (id);


--
-- Name: document_owner_backup document_owner_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_owner_backup
    ADD CONSTRAINT document_owner_backup_pkey PRIMARY KEY (document_id);


--
-- Name: document_status_history document_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_status_history
    ADD CONSTRAINT document_status_history_pkey PRIMARY KEY (id);


--
-- Name: document_structure_versions document_structure_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_structure_versions
    ADD CONSTRAINT document_structure_versions_pkey PRIMARY KEY (id);


--
-- Name: document_tree_proposal_votes document_tree_proposal_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposal_votes
    ADD CONSTRAINT document_tree_proposal_votes_pkey PRIMARY KEY (id);


--
-- Name: document_tree_proposal_votes document_tree_proposal_votes_proposal_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposal_votes
    ADD CONSTRAINT document_tree_proposal_votes_proposal_id_user_id_key UNIQUE (proposal_id, user_id);


--
-- Name: document_tree_proposals document_tree_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposals
    ADD CONSTRAINT document_tree_proposals_pkey PRIMARY KEY (id);


--
-- Name: document_votes document_votes_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_votes
    ADD CONSTRAINT document_votes_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: document_votes document_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_votes
    ADD CONSTRAINT document_votes_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: election_candidates election_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_candidates
    ADD CONSTRAINT election_candidates_pkey PRIMARY KEY (id);


--
-- Name: election_votes election_votes_election_id_user_id_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_votes
    ADD CONSTRAINT election_votes_election_id_user_id_candidate_id_key UNIQUE (election_id, user_id, candidate_id);


--
-- Name: election_votes election_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_votes
    ADD CONSTRAINT election_votes_pkey PRIMARY KEY (id);


--
-- Name: error_reports error_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_pkey PRIMARY KEY (id);


--
-- Name: governance_rule_history governance_rule_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_history
    ADD CONSTRAINT governance_rule_history_pkey PRIMARY KEY (id);


--
-- Name: governance_rule_proposal_options governance_rule_proposal_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_options
    ADD CONSTRAINT governance_rule_proposal_options_pkey PRIMARY KEY (id);


--
-- Name: governance_rule_proposal_votes governance_rule_proposal_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_votes
    ADD CONSTRAINT governance_rule_proposal_votes_pkey PRIMARY KEY (id);


--
-- Name: governance_rule_proposal_votes governance_rule_proposal_votes_proposal_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_votes
    ADD CONSTRAINT governance_rule_proposal_votes_proposal_id_user_id_key UNIQUE (proposal_id, user_id);


--
-- Name: governance_rule_proposals governance_rule_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposals
    ADD CONSTRAINT governance_rule_proposals_pkey PRIMARY KEY (id);


--
-- Name: history history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (id);


--
-- Name: meeting_agenda_items meeting_agenda_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_pkey PRIMARY KEY (id);


--
-- Name: meeting_brainstorm_options meeting_brainstorm_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_brainstorm_options
    ADD CONSTRAINT meeting_brainstorm_options_pkey PRIMARY KEY (id);


--
-- Name: meeting_minutes_events meeting_minutes_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes_events
    ADD CONSTRAINT meeting_minutes_events_pkey PRIMARY KEY (id);


--
-- Name: meeting_moderators meeting_moderators_meeting_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moderators
    ADD CONSTRAINT meeting_moderators_meeting_id_user_id_key UNIQUE (meeting_id, user_id);


--
-- Name: meeting_moderators meeting_moderators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moderators
    ADD CONSTRAINT meeting_moderators_pkey PRIMARY KEY (id);


--
-- Name: meeting_todos meeting_todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_pkey PRIMARY KEY (id);


--
-- Name: meeting_vote_options meeting_vote_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_options
    ADD CONSTRAINT meeting_vote_options_pkey PRIMARY KEY (id);


--
-- Name: meeting_vote_responses meeting_vote_responses_meeting_vote_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_responses
    ADD CONSTRAINT meeting_vote_responses_meeting_vote_id_user_id_key UNIQUE (meeting_vote_id, user_id);


--
-- Name: meeting_vote_responses meeting_vote_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_responses
    ADD CONSTRAINT meeting_vote_responses_pkey PRIMARY KEY (id);


--
-- Name: meeting_votes meeting_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_votes
    ADD CONSTRAINT meeting_votes_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: member_locations member_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_locations
    ADD CONSTRAINT member_locations_pkey PRIMARY KEY (id);


--
-- Name: member_locations member_locations_user_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_locations
    ADD CONSTRAINT member_locations_user_id_organization_id_key UNIQUE (user_id, organization_id);


--
-- Name: migration_history migration_history_migration_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history
    ADD CONSTRAINT migration_history_migration_name_key UNIQUE (migration_name);


--
-- Name: migration_history migration_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history
    ADD CONSTRAINT migration_history_pkey PRIMARY KEY (id);


--
-- Name: notification_digest_queue notification_digest_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_digest_queue
    ADD CONSTRAINT notification_digest_queue_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organization_audit organization_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit
    ADD CONSTRAINT organization_audit_pkey PRIMARY KEY (id);


--
-- Name: organization_governance_rules organization_governance_rules_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_governance_rules
    ADD CONSTRAINT organization_governance_rules_organization_id_key UNIQUE (organization_id);


--
-- Name: organization_governance_rules organization_governance_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_governance_rules
    ADD CONSTRAINT organization_governance_rules_pkey PRIMARY KEY (id);


--
-- Name: organization_invitations organization_invitations_invitation_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_invitation_token_key UNIQUE (invitation_token);


--
-- Name: organization_invitations organization_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_representatives organization_representatives_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_representatives
    ADD CONSTRAINT organization_representatives_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_representatives organization_representatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_representatives
    ADD CONSTRAINT organization_representatives_pkey PRIMARY KEY (id);


--
-- Name: organization_votes organization_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_votes
    ADD CONSTRAINT organization_votes_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: paragraphs paragraphs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paragraphs
    ADD CONSTRAINT paragraphs_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: policy_vote_responses policy_vote_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_vote_responses
    ADD CONSTRAINT policy_vote_responses_pkey PRIMARY KEY (id);


--
-- Name: policy_vote_responses policy_vote_responses_policy_vote_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_vote_responses
    ADD CONSTRAINT policy_vote_responses_policy_vote_id_user_id_key UNIQUE (policy_vote_id, user_id);


--
-- Name: policy_votes policy_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_votes
    ADD CONSTRAINT policy_votes_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: representative_elections representative_elections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_elections
    ADD CONSTRAINT representative_elections_pkey PRIMARY KEY (id);


--
-- Name: representative_terms representative_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_terms
    ADD CONSTRAINT representative_terms_pkey PRIMARY KEY (id);


--
-- Name: scheduling_poll_responses scheduling_poll_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_responses
    ADD CONSTRAINT scheduling_poll_responses_pkey PRIMARY KEY (id);


--
-- Name: scheduling_poll_responses scheduling_poll_responses_slot_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_responses
    ADD CONSTRAINT scheduling_poll_responses_slot_id_user_id_key UNIQUE (slot_id, user_id);


--
-- Name: scheduling_poll_slots scheduling_poll_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_slots
    ADD CONSTRAINT scheduling_poll_slots_pkey PRIMARY KEY (id);


--
-- Name: scheduling_polls scheduling_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_polls
    ADD CONSTRAINT scheduling_polls_pkey PRIMARY KEY (id);


--
-- Name: structure_change_log structure_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_change_log
    ADD CONSTRAINT structure_change_log_pkey PRIMARY KEY (id);


--
-- Name: structure_operations structure_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_operations
    ADD CONSTRAINT structure_operations_pkey PRIMARY KEY (id);


--
-- Name: structure_proposal_votes structure_proposal_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposal_votes
    ADD CONSTRAINT structure_proposal_votes_pkey PRIMARY KEY (id);


--
-- Name: structure_proposal_votes structure_proposal_votes_structure_proposal_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposal_votes
    ADD CONSTRAINT structure_proposal_votes_structure_proposal_id_user_id_key UNIQUE (structure_proposal_id, user_id);


--
-- Name: structure_proposals structure_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposals
    ADD CONSTRAINT structure_proposals_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vote_ballots vote_ballots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_ballots
    ADD CONSTRAINT vote_ballots_pkey PRIMARY KEY (id);


--
-- Name: vote_ballots vote_ballots_vote_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_ballots
    ADD CONSTRAINT vote_ballots_vote_id_user_id_key UNIQUE (vote_id, user_id);


--
-- Name: vote_verification_log vote_verification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_verification_log
    ADD CONSTRAINT vote_verification_log_pkey PRIMARY KEY (id);


--
-- Name: voter_tokens voter_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voter_tokens
    ADD CONSTRAINT voter_tokens_pkey PRIMARY KEY (id);


--
-- Name: voter_tokens voter_tokens_voting_session_id_anonymous_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voter_tokens
    ADD CONSTRAINT voter_tokens_voting_session_id_anonymous_token_key UNIQUE (voting_session_id, anonymous_token);


--
-- Name: voter_tokens voter_tokens_voting_session_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voter_tokens
    ADD CONSTRAINT voter_tokens_voting_session_id_user_id_key UNIQUE (voting_session_id, user_id);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: votes votes_proposal_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_proposal_id_user_id_key UNIQUE (proposal_id, user_id);


--
-- Name: voting_analytics voting_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_analytics
    ADD CONSTRAINT voting_analytics_pkey PRIMARY KEY (id);


--
-- Name: voting_session_votes voting_session_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_session_votes
    ADD CONSTRAINT voting_session_votes_pkey PRIMARY KEY (id);


--
-- Name: voting_session_votes voting_session_votes_voting_session_id_anonymous_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_session_votes
    ADD CONSTRAINT voting_session_votes_voting_session_id_anonymous_token_key UNIQUE (voting_session_id, anonymous_token);


--
-- Name: voting_sessions voting_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_sessions
    ADD CONSTRAINT voting_sessions_pkey PRIMARY KEY (id);


--
-- Name: idx_anonymous_vote_ballots_session_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_anonymous_vote_ballots_session_token ON public.anonymous_vote_ballots USING btree (voting_session_id, voter_token);


--
-- Name: idx_comments_commentable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_commentable ON public.comments USING btree (commentable_type, commentable_id);


--
-- Name: idx_comments_commentable_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_commentable_created ON public.comments USING btree (commentable_type, commentable_id, created_at DESC);


--
-- Name: idx_comments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_created_at ON public.comments USING btree (created_at);


--
-- Name: idx_comments_created_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_created_at_brin ON public.comments USING brin (created_at);


--
-- Name: idx_comments_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_parent_id ON public.comments USING btree (parent_id);


--
-- Name: idx_comments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_user_id ON public.comments USING btree (user_id);


--
-- Name: idx_deletion_votes_doc_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deletion_votes_doc_vote ON public.document_deletion_votes USING btree (document_id, vote);


--
-- Name: idx_digest_queue_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_digest_queue_user_created ON public.notification_digest_queue USING btree (user_id, created_at);


--
-- Name: idx_digest_queue_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_digest_queue_user_type ON public.notification_digest_queue USING btree (user_id, event_type);


--
-- Name: idx_document_collaborators_document_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_collaborators_document_user ON public.document_collaborators USING btree (document_id, user_id);


--
-- Name: idx_document_collaborators_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_collaborators_user ON public.document_collaborators USING btree (user_id, document_id);


--
-- Name: idx_document_deletion_votes_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_deletion_votes_doc ON public.document_deletion_votes USING btree (document_id);


--
-- Name: idx_document_deletion_votes_document_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_document_deletion_votes_document_user ON public.document_deletion_votes USING btree (document_id, user_id);


--
-- Name: idx_document_deletion_votes_document_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_deletion_votes_document_vote ON public.document_deletion_votes USING btree (document_id, vote);


--
-- Name: idx_document_status_history_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_status_history_doc ON public.document_status_history USING btree (document_id, created_at);


--
-- Name: idx_document_structure_versions_doc_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_structure_versions_doc_version ON public.document_structure_versions USING btree (document_id, version_number);


--
-- Name: idx_document_tree_proposal_votes_proposal_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_document_tree_proposal_votes_proposal_user ON public.document_tree_proposal_votes USING btree (proposal_id, user_id);


--
-- Name: idx_document_tree_proposal_votes_proposal_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_tree_proposal_votes_proposal_vote ON public.document_tree_proposal_votes USING btree (proposal_id, vote);


--
-- Name: idx_document_votes_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_votes_document_id ON public.document_votes USING btree (document_id);


--
-- Name: idx_document_votes_document_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_votes_document_user ON public.document_votes USING btree (document_id, user_id);


--
-- Name: idx_document_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_votes_user_id ON public.document_votes USING btree (user_id);


--
-- Name: idx_documents_created_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_created_at_brin ON public.documents USING brin (created_at);


--
-- Name: idx_documents_deletion_proposed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_deletion_proposed ON public.documents USING btree (deletion_proposed_at) WHERE (deletion_proposed_at IS NOT NULL);


--
-- Name: idx_documents_document_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_document_kind ON public.documents USING btree (document_kind);


--
-- Name: idx_documents_meeting_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_meeting_id ON public.documents USING btree (meeting_id);


--
-- Name: idx_documents_org_ownership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_org_ownership ON public.documents USING btree (organization_id, ownership_type) WHERE (ownership_type = 'organizational'::text);


--
-- Name: idx_documents_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_organization_id ON public.documents USING btree (organization_id);


--
-- Name: idx_documents_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_owner ON public.documents USING btree (owner_id, updated_at DESC);


--
-- Name: idx_documents_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_owner_id ON public.documents USING btree (owner_id);


--
-- Name: idx_documents_ownership_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_ownership_owner ON public.documents USING btree (ownership_type, owner_id);


--
-- Name: idx_documents_parent_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_parent_sort ON public.documents USING btree (parent_id, sort_order);


--
-- Name: idx_documents_parent_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_parent_sort_order ON public.documents USING btree (parent_id, sort_order NULLS FIRST);


--
-- Name: idx_documents_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_search_vector ON public.documents USING gin (search_vector);


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_documents_status_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status_deadline ON public.documents USING btree (status, proposal_deadline) WHERE (status = 'proposal'::text);


--
-- Name: idx_documents_status_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status_organization ON public.documents USING btree (status, organization_id);


--
-- Name: idx_documents_updated_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_updated_at_brin ON public.documents USING brin (updated_at);


--
-- Name: idx_documents_voting_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_voting_deadline ON public.documents USING btree (status, voting_deadline) WHERE (status = 'voting'::text);


--
-- Name: idx_election_candidates_election; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_election_candidates_election ON public.election_candidates USING btree (election_id);


--
-- Name: idx_election_votes_election; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_election_votes_election ON public.election_votes USING btree (election_id);


--
-- Name: idx_election_votes_election_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_election_votes_election_id ON public.election_votes USING btree (election_id);


--
-- Name: idx_election_votes_election_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_election_votes_election_user ON public.election_votes USING btree (election_id, user_id);


--
-- Name: idx_error_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_reports_created_at ON public.error_reports USING btree (created_at DESC);


--
-- Name: idx_error_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_reports_status ON public.error_reports USING btree (status, created_at DESC);


--
-- Name: idx_error_reports_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_reports_user ON public.error_reports USING btree (user_id, created_at DESC);


--
-- Name: idx_governance_rule_proposal_votes_proposal_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_governance_rule_proposal_votes_proposal_user ON public.governance_rule_proposal_votes USING btree (proposal_id, user_id);


--
-- Name: idx_governance_rule_proposal_votes_proposal_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_rule_proposal_votes_proposal_vote ON public.governance_rule_proposal_votes USING btree (proposal_id, vote);


--
-- Name: idx_governance_rule_proposals_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_rule_proposals_org_status ON public.governance_rule_proposals USING btree (organization_id, status);


--
-- Name: idx_history_approval_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_approval_created ON public.history USING btree (approval_percentage DESC, created_at DESC);


--
-- Name: idx_history_created_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_created_at_brin ON public.history USING brin (created_at);


--
-- Name: idx_history_paragraph_approval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_paragraph_approval ON public.history USING btree (paragraph_id, approval_percentage DESC, created_at DESC);


--
-- Name: idx_meeting_agenda_items_meeting_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_agenda_items_meeting_order ON public.meeting_agenda_items USING btree (meeting_id, order_index);


--
-- Name: idx_meeting_brainstorm_options_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_brainstorm_options_meeting ON public.meeting_brainstorm_options USING btree (meeting_id);


--
-- Name: idx_meeting_minutes_events_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_minutes_events_doc ON public.meeting_minutes_events USING btree (minutes_document_id);


--
-- Name: idx_meeting_minutes_events_meeting_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_minutes_events_meeting_order ON public.meeting_minutes_events USING btree (meeting_id, order_index);


--
-- Name: idx_meeting_moderators_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_moderators_meeting ON public.meeting_moderators USING btree (meeting_id);


--
-- Name: idx_meeting_todos_meeting_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_todos_meeting_order ON public.meeting_todos USING btree (meeting_id, order_index);


--
-- Name: idx_meeting_vote_options_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_vote_options_vote ON public.meeting_vote_options USING btree (meeting_vote_id);


--
-- Name: idx_meeting_vote_responses_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_vote_responses_vote ON public.meeting_vote_responses USING btree (meeting_vote_id);


--
-- Name: idx_meeting_votes_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_votes_meeting ON public.meeting_votes USING btree (meeting_id);


--
-- Name: idx_meetings_current_agenda_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_current_agenda_item ON public.meetings USING btree (current_agenda_item_id);


--
-- Name: idx_meetings_minutes_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_minutes_document ON public.meetings USING btree (minutes_document_id);


--
-- Name: idx_meetings_org_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_org_scheduled ON public.meetings USING btree (organization_id, scheduled_at);


--
-- Name: idx_member_locations_org_show; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_locations_org_show ON public.member_locations USING btree (organization_id, show_on_map);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, read);


--
-- Name: idx_org_members_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_org_user ON public.organization_members USING btree (organization_id, user_id);


--
-- Name: idx_org_members_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_user_status ON public.organization_members USING btree (user_id, status);


--
-- Name: idx_org_reps_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_reps_org_user ON public.organization_representatives USING btree (organization_id, user_id);


--
-- Name: idx_org_reps_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_reps_user_status ON public.organization_representatives USING btree (user_id, status);


--
-- Name: idx_organization_audit_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_audit_organization_id ON public.organization_audit USING btree (organization_id);


--
-- Name: idx_organization_members_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_org_status ON public.organization_members USING btree (organization_id, status);


--
-- Name: idx_organization_members_org_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_org_user_status ON public.organization_members USING btree (organization_id, user_id, status);


--
-- Name: idx_organization_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);


--
-- Name: idx_organization_representatives_org_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_representatives_org_user_status ON public.organization_representatives USING btree (organization_id, user_id, status);


--
-- Name: idx_organization_votes_ends_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_votes_ends_at ON public.organization_votes USING btree (voting_ends_at) WHERE (status = 'approved'::text);


--
-- Name: idx_organization_votes_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_votes_org ON public.organization_votes USING btree (organization_id, status);


--
-- Name: idx_organization_votes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_votes_status ON public.organization_votes USING btree (status);


--
-- Name: idx_orgs_active_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_active_created ON public.organizations USING btree (is_active, created_at DESC);


--
-- Name: idx_paragraphs_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paragraphs_document_id ON public.paragraphs USING btree (document_id);


--
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_proposals_created_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_created_at_brin ON public.proposals USING brin (created_at);


--
-- Name: idx_proposals_paragraph_approved_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_paragraph_approved_created ON public.proposals USING btree (paragraph_id, approved, created_at DESC);


--
-- Name: idx_proposals_paragraph_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_paragraph_created ON public.proposals USING btree (paragraph_id, created_at DESC);


--
-- Name: idx_proposals_pending_paragraph; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_pending_paragraph ON public.proposals USING btree (paragraph_id, approved, created_at DESC) WHERE (approved = false);


--
-- Name: idx_proposals_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_user_id ON public.proposals USING btree (user_id);


--
-- Name: idx_representative_elections_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representative_elections_org ON public.representative_elections USING btree (organization_id, status);


--
-- Name: idx_representative_elections_phase_transitions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representative_elections_phase_transitions ON public.representative_elections USING btree (organization_id, status, auto_advance_phases, phase_transition_in_progress);


--
-- Name: idx_representative_terms_expiration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representative_terms_expiration ON public.representative_terms USING btree (organization_id, term_end_date, term_status);


--
-- Name: idx_representative_terms_pending_resignation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_representative_terms_pending_resignation ON public.representative_terms USING btree (organization_id, resignation_pending, term_status);


--
-- Name: idx_rule_history_org_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_history_org_field ON public.governance_rule_history USING btree (organization_id, rule_field, changed_at);


--
-- Name: idx_rule_history_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_history_proposal ON public.governance_rule_history USING btree (changed_by_proposal_id);


--
-- Name: idx_rule_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_history_user ON public.governance_rule_history USING btree (changed_by_user_id);


--
-- Name: idx_rule_proposal_options_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_proposal_options_proposal ON public.governance_rule_proposal_options USING btree (proposal_id);


--
-- Name: idx_rule_proposal_votes_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_proposal_votes_proposal ON public.governance_rule_proposal_votes USING btree (proposal_id);


--
-- Name: idx_rule_proposal_votes_proposal_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_proposal_votes_proposal_vote ON public.governance_rule_proposal_votes USING btree (proposal_id, vote);


--
-- Name: idx_rule_proposals_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_proposals_deadline ON public.governance_rule_proposals USING btree (voting_ends_at) WHERE (status = 'voting'::text);


--
-- Name: idx_rule_proposals_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_proposals_org ON public.governance_rule_proposals USING btree (organization_id, status);


--
-- Name: idx_scheduling_poll_responses_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduling_poll_responses_slot ON public.scheduling_poll_responses USING btree (slot_id);


--
-- Name: idx_scheduling_poll_slots_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduling_poll_slots_poll ON public.scheduling_poll_slots USING btree (scheduling_poll_id);


--
-- Name: idx_scheduling_polls_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduling_polls_org_status ON public.scheduling_polls USING btree (organization_id, status);


--
-- Name: idx_structure_change_log_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_change_log_version ON public.structure_change_log USING btree (version_id);


--
-- Name: idx_structure_operations_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_operations_proposal ON public.structure_operations USING btree (structure_proposal_id);


--
-- Name: idx_structure_proposal_votes_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_proposal_votes_proposal ON public.structure_proposal_votes USING btree (structure_proposal_id);


--
-- Name: idx_structure_proposal_votes_proposal_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_structure_proposal_votes_proposal_user ON public.structure_proposal_votes USING btree (structure_proposal_id, user_id);


--
-- Name: idx_structure_proposal_votes_proposal_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_proposal_votes_proposal_vote ON public.structure_proposal_votes USING btree (structure_proposal_id, vote);


--
-- Name: idx_structure_proposals_doc_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_structure_proposals_doc_approved ON public.structure_proposals USING btree (document_id, approved, applied);


--
-- Name: idx_tree_proposal_votes_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tree_proposal_votes_proposal ON public.document_tree_proposal_votes USING btree (proposal_id);


--
-- Name: idx_tree_proposal_votes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tree_proposal_votes_user ON public.document_tree_proposal_votes USING btree (user_id);


--
-- Name: idx_tree_proposals_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tree_proposals_document ON public.document_tree_proposals USING btree (document_id, status);


--
-- Name: idx_tree_proposals_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tree_proposals_org ON public.document_tree_proposals USING btree (organization_id, status);


--
-- Name: idx_tree_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tree_proposals_status ON public.document_tree_proposals USING btree (status, created_at);


--
-- Name: idx_vote_ballots_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_ballots_user ON public.vote_ballots USING btree (user_id);


--
-- Name: idx_vote_ballots_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_ballots_vote ON public.vote_ballots USING btree (vote_id);


--
-- Name: idx_vote_ballots_vote_choice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_ballots_vote_choice ON public.vote_ballots USING btree (vote_id, vote_choice);


--
-- Name: idx_vote_ballots_vote_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vote_ballots_vote_user ON public.vote_ballots USING btree (vote_id, user_id);


--
-- Name: idx_vote_verification_log_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_verification_log_sequence ON public.vote_verification_log USING btree (sequence_index);


--
-- Name: idx_vote_verification_log_type_contest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_verification_log_type_contest ON public.vote_verification_log USING btree (vote_type, contest_id);


--
-- Name: idx_votes_created_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votes_created_at_brin ON public.votes USING brin (created_at);


--
-- Name: idx_votes_proposal_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votes_proposal_vote ON public.votes USING btree (proposal_id, vote);


--
-- Name: idx_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votes_user_id ON public.votes USING btree (user_id);


--
-- Name: idx_voting_analytics_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voting_analytics_org ON public.voting_analytics USING btree (organization_id, period_start, period_end);


--
-- Name: idx_voting_analytics_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voting_analytics_organization_id ON public.voting_analytics USING btree (organization_id);


--
-- Name: idx_voting_session_votes_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voting_session_votes_session_id ON public.voting_session_votes USING btree (voting_session_id);


--
-- Name: idx_voting_sessions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voting_sessions_org ON public.voting_sessions USING btree (organization_id, status);


--
-- Name: idx_voting_sessions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voting_sessions_organization_id ON public.voting_sessions USING btree (organization_id);


--
-- Name: documents documents_search_vector_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_search_vector_update BEFORE INSERT OR UPDATE OF title, description ON public.documents FOR EACH ROW EXECUTE FUNCTION public.documents_search_vector_update();


--
-- Name: anonymous_vote_ballots anonymous_vote_ballots_voting_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_vote_ballots
    ADD CONSTRAINT anonymous_vote_ballots_voting_session_id_fkey FOREIGN KEY (voting_session_id) REFERENCES public.voting_sessions(id) ON DELETE CASCADE;


--
-- Name: comment_upvotes comment_upvotes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_upvotes
    ADD CONSTRAINT comment_upvotes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_upvotes comment_upvotes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_upvotes
    ADD CONSTRAINT comment_upvotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id);


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_collaborators document_collaborators_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_collaborators
    ADD CONSTRAINT document_collaborators_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: document_collaborators document_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_collaborators
    ADD CONSTRAINT document_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_deletion_votes document_deletion_votes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_deletion_votes
    ADD CONSTRAINT document_deletion_votes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_deletion_votes document_deletion_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_deletion_votes
    ADD CONSTRAINT document_deletion_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_invitations document_invitations_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_invitations
    ADD CONSTRAINT document_invitations_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_invitations document_invitations_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_invitations
    ADD CONSTRAINT document_invitations_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_invitations document_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_invitations
    ADD CONSTRAINT document_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_status_history document_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_status_history
    ADD CONSTRAINT document_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_status_history document_status_history_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_status_history
    ADD CONSTRAINT document_status_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_structure_versions document_structure_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_structure_versions
    ADD CONSTRAINT document_structure_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: document_structure_versions document_structure_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_structure_versions
    ADD CONSTRAINT document_structure_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_structure_versions document_structure_versions_related_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_structure_versions
    ADD CONSTRAINT document_structure_versions_related_proposal_id_fkey FOREIGN KEY (related_proposal_id) REFERENCES public.structure_proposals(id);


--
-- Name: document_tree_proposal_votes document_tree_proposal_votes_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposal_votes
    ADD CONSTRAINT document_tree_proposal_votes_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.document_tree_proposals(id) ON DELETE CASCADE;


--
-- Name: document_tree_proposal_votes document_tree_proposal_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposal_votes
    ADD CONSTRAINT document_tree_proposal_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_tree_proposals document_tree_proposals_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposals
    ADD CONSTRAINT document_tree_proposals_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_tree_proposals document_tree_proposals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposals
    ADD CONSTRAINT document_tree_proposals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: document_tree_proposals document_tree_proposals_proposed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tree_proposals
    ADD CONSTRAINT document_tree_proposals_proposed_by_user_id_fkey FOREIGN KEY (proposed_by_user_id) REFERENCES public.users(id);


--
-- Name: document_votes document_votes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_votes
    ADD CONSTRAINT document_votes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_votes document_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_votes
    ADD CONSTRAINT document_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: documents documents_deletion_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_deletion_proposed_by_fkey FOREIGN KEY (deletion_proposed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;


--
-- Name: documents documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: election_candidates election_candidates_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_candidates
    ADD CONSTRAINT election_candidates_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.representative_elections(id) ON DELETE CASCADE;


--
-- Name: election_candidates election_candidates_nominated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_candidates
    ADD CONSTRAINT election_candidates_nominated_by_fkey FOREIGN KEY (nominated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: election_candidates election_candidates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_candidates
    ADD CONSTRAINT election_candidates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: election_votes election_votes_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_votes
    ADD CONSTRAINT election_votes_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.election_candidates(id) ON DELETE CASCADE;


--
-- Name: election_votes election_votes_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_votes
    ADD CONSTRAINT election_votes_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.representative_elections(id) ON DELETE CASCADE;


--
-- Name: election_votes election_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.election_votes
    ADD CONSTRAINT election_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: error_reports error_reports_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: error_reports error_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: governance_rule_history governance_rule_history_changed_by_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_history
    ADD CONSTRAINT governance_rule_history_changed_by_proposal_id_fkey FOREIGN KEY (changed_by_proposal_id) REFERENCES public.governance_rule_proposals(id);


--
-- Name: governance_rule_history governance_rule_history_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_history
    ADD CONSTRAINT governance_rule_history_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id);


--
-- Name: governance_rule_history governance_rule_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_history
    ADD CONSTRAINT governance_rule_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: governance_rule_proposal_options governance_rule_proposal_options_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_options
    ADD CONSTRAINT governance_rule_proposal_options_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.governance_rule_proposals(id) ON DELETE CASCADE;


--
-- Name: governance_rule_proposal_votes governance_rule_proposal_votes_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_votes
    ADD CONSTRAINT governance_rule_proposal_votes_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.governance_rule_proposals(id) ON DELETE CASCADE;


--
-- Name: governance_rule_proposal_votes governance_rule_proposal_votes_selected_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_votes
    ADD CONSTRAINT governance_rule_proposal_votes_selected_option_id_fkey FOREIGN KEY (selected_option_id) REFERENCES public.governance_rule_proposal_options(id) ON DELETE CASCADE;


--
-- Name: governance_rule_proposal_votes governance_rule_proposal_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposal_votes
    ADD CONSTRAINT governance_rule_proposal_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: governance_rule_proposals governance_rule_proposals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposals
    ADD CONSTRAINT governance_rule_proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: governance_rule_proposals governance_rule_proposals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_rule_proposals
    ADD CONSTRAINT governance_rule_proposals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: history history_paragraph_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_paragraph_id_fkey FOREIGN KEY (paragraph_id) REFERENCES public.paragraphs(id);


--
-- Name: history history_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id);


--
-- Name: history history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: meeting_agenda_items meeting_agenda_items_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_agenda_items meeting_agenda_items_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_agenda_items
    ADD CONSTRAINT meeting_agenda_items_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_brainstorm_options meeting_brainstorm_options_brainstorm_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_brainstorm_options
    ADD CONSTRAINT meeting_brainstorm_options_brainstorm_event_id_fkey FOREIGN KEY (brainstorm_event_id) REFERENCES public.meeting_minutes_events(id) ON DELETE CASCADE;


--
-- Name: meeting_brainstorm_options meeting_brainstorm_options_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_brainstorm_options
    ADD CONSTRAINT meeting_brainstorm_options_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_brainstorm_options meeting_brainstorm_options_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_brainstorm_options
    ADD CONSTRAINT meeting_brainstorm_options_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_minutes_events meeting_minutes_events_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes_events
    ADD CONSTRAINT meeting_minutes_events_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_minutes_events meeting_minutes_events_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes_events
    ADD CONSTRAINT meeting_minutes_events_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_minutes_events meeting_minutes_events_minutes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes_events
    ADD CONSTRAINT meeting_minutes_events_minutes_document_id_fkey FOREIGN KEY (minutes_document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: meeting_moderators meeting_moderators_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moderators
    ADD CONSTRAINT meeting_moderators_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_moderators meeting_moderators_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moderators
    ADD CONSTRAINT meeting_moderators_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_moderators meeting_moderators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_moderators
    ADD CONSTRAINT meeting_moderators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: meeting_todos meeting_todos_agenda_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_agenda_item_id_fkey FOREIGN KEY (agenda_item_id) REFERENCES public.meeting_agenda_items(id) ON DELETE SET NULL;


--
-- Name: meeting_todos meeting_todos_completed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_todos meeting_todos_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_todos meeting_todos_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_todos meeting_todos_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_todos
    ADD CONSTRAINT meeting_todos_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id);


--
-- Name: meeting_vote_options meeting_vote_options_meeting_vote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_options
    ADD CONSTRAINT meeting_vote_options_meeting_vote_id_fkey FOREIGN KEY (meeting_vote_id) REFERENCES public.meeting_votes(id) ON DELETE CASCADE;


--
-- Name: meeting_vote_responses meeting_vote_responses_meeting_vote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_responses
    ADD CONSTRAINT meeting_vote_responses_meeting_vote_id_fkey FOREIGN KEY (meeting_vote_id) REFERENCES public.meeting_votes(id) ON DELETE CASCADE;


--
-- Name: meeting_vote_responses meeting_vote_responses_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_responses
    ADD CONSTRAINT meeting_vote_responses_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.meeting_vote_options(id) ON DELETE CASCADE;


--
-- Name: meeting_vote_responses meeting_vote_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_vote_responses
    ADD CONSTRAINT meeting_vote_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: meeting_votes meeting_votes_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_votes
    ADD CONSTRAINT meeting_votes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meeting_votes meeting_votes_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_votes
    ADD CONSTRAINT meeting_votes_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_votes meeting_votes_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_votes
    ADD CONSTRAINT meeting_votes_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.meeting_minutes_events(id);


--
-- Name: meetings meetings_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: meetings meetings_created_from_scheduling_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_created_from_scheduling_poll_id_fkey FOREIGN KEY (created_from_scheduling_poll_id) REFERENCES public.scheduling_polls(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_current_agenda_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_current_agenda_item_id_fkey FOREIGN KEY (current_agenda_item_id) REFERENCES public.meeting_agenda_items(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_minutes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_minutes_document_id_fkey FOREIGN KEY (minutes_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_locations member_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_locations
    ADD CONSTRAINT member_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_locations member_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_locations
    ADD CONSTRAINT member_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_digest_queue notification_digest_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_digest_queue
    ADD CONSTRAINT notification_digest_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organization_audit organization_audit_affected_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit
    ADD CONSTRAINT organization_audit_affected_user_id_fkey FOREIGN KEY (affected_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_audit organization_audit_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit
    ADD CONSTRAINT organization_audit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_audit organization_audit_performed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit
    ADD CONSTRAINT organization_audit_performed_by_user_id_fkey FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_governance_rules organization_governance_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_governance_rules
    ADD CONSTRAINT organization_governance_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_invitations organization_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_invitations organization_invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_invited_by_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_invited_by_rep_id_fkey FOREIGN KEY (invited_by_rep_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: organization_representatives organization_representatives_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_representatives
    ADD CONSTRAINT organization_representatives_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_representatives organization_representatives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_representatives
    ADD CONSTRAINT organization_representatives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: organization_votes organization_votes_approved_by_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_votes
    ADD CONSTRAINT organization_votes_approved_by_rep_id_fkey FOREIGN KEY (approved_by_rep_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_votes organization_votes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_votes
    ADD CONSTRAINT organization_votes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_votes organization_votes_proposed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_votes
    ADD CONSTRAINT organization_votes_proposed_by_user_id_fkey FOREIGN KEY (proposed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organization_votes organization_votes_target_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_votes
    ADD CONSTRAINT organization_votes_target_document_id_fkey FOREIGN KEY (target_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_admin_id_fkey FOREIGN KEY (created_by_admin_id) REFERENCES public.users(id);


--
-- Name: paragraphs paragraphs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paragraphs
    ADD CONSTRAINT paragraphs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: policy_vote_responses policy_vote_responses_policy_vote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_vote_responses
    ADD CONSTRAINT policy_vote_responses_policy_vote_id_fkey FOREIGN KEY (policy_vote_id) REFERENCES public.policy_votes(id) ON DELETE CASCADE;


--
-- Name: policy_vote_responses policy_vote_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_vote_responses
    ADD CONSTRAINT policy_vote_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: policy_votes policy_votes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_votes
    ADD CONSTRAINT policy_votes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: policy_votes policy_votes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_votes
    ADD CONSTRAINT policy_votes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: policy_votes policy_votes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_votes
    ADD CONSTRAINT policy_votes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_paragraph_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_paragraph_id_fkey FOREIGN KEY (paragraph_id) REFERENCES public.paragraphs(id);


--
-- Name: proposals proposals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: representative_elections representative_elections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_elections
    ADD CONSTRAINT representative_elections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: representative_elections representative_elections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_elections
    ADD CONSTRAINT representative_elections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: representative_terms representative_terms_elected_in_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_terms
    ADD CONSTRAINT representative_terms_elected_in_election_id_fkey FOREIGN KEY (elected_in_election_id) REFERENCES public.representative_elections(id);


--
-- Name: representative_terms representative_terms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_terms
    ADD CONSTRAINT representative_terms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: representative_terms representative_terms_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_terms
    ADD CONSTRAINT representative_terms_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: representative_terms representative_terms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.representative_terms
    ADD CONSTRAINT representative_terms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: scheduling_poll_responses scheduling_poll_responses_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_responses
    ADD CONSTRAINT scheduling_poll_responses_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.scheduling_poll_slots(id) ON DELETE CASCADE;


--
-- Name: scheduling_poll_responses scheduling_poll_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_responses
    ADD CONSTRAINT scheduling_poll_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: scheduling_poll_slots scheduling_poll_slots_scheduling_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_poll_slots
    ADD CONSTRAINT scheduling_poll_slots_scheduling_poll_id_fkey FOREIGN KEY (scheduling_poll_id) REFERENCES public.scheduling_polls(id) ON DELETE CASCADE;


--
-- Name: scheduling_polls scheduling_polls_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_polls
    ADD CONSTRAINT scheduling_polls_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: scheduling_polls scheduling_polls_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_polls
    ADD CONSTRAINT scheduling_polls_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: structure_change_log structure_change_log_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_change_log
    ADD CONSTRAINT structure_change_log_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: structure_change_log structure_change_log_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_change_log
    ADD CONSTRAINT structure_change_log_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.document_structure_versions(id) ON DELETE CASCADE;


--
-- Name: structure_operations structure_operations_structure_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_operations
    ADD CONSTRAINT structure_operations_structure_proposal_id_fkey FOREIGN KEY (structure_proposal_id) REFERENCES public.structure_proposals(id) ON DELETE CASCADE;


--
-- Name: structure_proposal_votes structure_proposal_votes_structure_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposal_votes
    ADD CONSTRAINT structure_proposal_votes_structure_proposal_id_fkey FOREIGN KEY (structure_proposal_id) REFERENCES public.structure_proposals(id);


--
-- Name: structure_proposal_votes structure_proposal_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposal_votes
    ADD CONSTRAINT structure_proposal_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: structure_proposals structure_proposals_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposals
    ADD CONSTRAINT structure_proposals_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: structure_proposals structure_proposals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structure_proposals
    ADD CONSTRAINT structure_proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: vote_ballots vote_ballots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_ballots
    ADD CONSTRAINT vote_ballots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: vote_ballots vote_ballots_vote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_ballots
    ADD CONSTRAINT vote_ballots_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES public.organization_votes(id) ON DELETE CASCADE;


--
-- Name: voter_tokens voter_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voter_tokens
    ADD CONSTRAINT voter_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: voter_tokens voter_tokens_voting_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voter_tokens
    ADD CONSTRAINT voter_tokens_voting_session_id_fkey FOREIGN KEY (voting_session_id) REFERENCES public.voting_sessions(id) ON DELETE CASCADE;


--
-- Name: votes votes_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id);


--
-- Name: votes votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: voting_analytics voting_analytics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_analytics
    ADD CONSTRAINT voting_analytics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: voting_session_votes voting_session_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_session_votes
    ADD CONSTRAINT voting_session_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: voting_session_votes voting_session_votes_voting_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_session_votes
    ADD CONSTRAINT voting_session_votes_voting_session_id_fkey FOREIGN KEY (voting_session_id) REFERENCES public.voting_sessions(id) ON DELETE CASCADE;


--
-- Name: voting_sessions voting_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_sessions
    ADD CONSTRAINT voting_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: voting_sessions voting_sessions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_sessions
    ADD CONSTRAINT voting_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict T5dT6rsqn8gHUtzRfylNWyMW0UMWn0a07rhyQVUCpJghVNCGgOQDBfhUfkkaO99

