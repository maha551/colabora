# Meeting Minutes and Agenda – Best Practices

This document summarizes widely accepted best practices for organizational meeting agendas and minutes, and how the app supports them.

---

## Agenda (before the meeting)

**Why it matters:** Meetings with a clear agenda are more likely to achieve their objectives and end on time. Sharing the agenda in advance lets attendees prepare.

### Best practices

- **Set a clear objective** – What should the meeting accomplish?
- **List topics** – 4–5 main items is a good target.
- **Share in advance** – Ideally 24 hours before so people can read and prepare.
- **Optional:** Time per topic, facilitator, and note-taker.

### In this app

- Each meeting has a dedicated **Agenda items** list (separate from freeform minutes paragraphs).
- Moderators can set the **current topic** from agenda items. Timeline entries are grouped under the active topic.
- Minutes paragraphs are still used for notes and structured sections (Attendees, Discussion, Decisions, etc.).
- Share the **meeting link** (or calendar invite) so attendees can open the meeting page and follow agenda + minutes in real time.

---

## Minutes (during and after the meeting)

**Why it matters:** Good minutes are a single source of truth for decisions and actions. They support accountability and continuity.

### Recommended structure

1. **Header** – Meeting name, date, time, location/platform (often already in the meeting record).
2. **Attendees** – Who was present (and optionally absent). Helps with quorum and follow-up.
3. **Agenda / Discussion** – Summary of what was discussed per topic. Focus on outcomes, not word-for-word transcript.
4. **Decisions** – What was decided (approvals, deferrals, referrals). Use neutral, factual language.
5. **Action items / To-dos** – Task, **owner**, and **due date** for each. Clear ownership increases completion. In this app, use **To-dos** (Add to-do) for structured tasks: they appear in the timeline where created and are listed at the top of the exported minutes; the responsible person can update status (e.g. mark done) even after minutes are finalized.
6. **Next meeting** – When is the next meeting and what will be carried over?

### Best practices

- **Focus on outcomes** – Record decisions and actions, not every comment.
- **Neutral language** – Avoid recording who “strongly disagreed”; state that “the group discussed X; no consensus was reached” (or the actual outcome).
- **Assign owners and deadlines** – Every action item should have a responsible person and a date.
- **Keep it scannable** – Use headings and short paragraphs so readers can find decisions and actions quickly.
- **Share promptly** – Distribute minutes soon after the meeting (e.g. via link or export).

### In this app

- Use **Add paragraph** and the **section presets** (Agenda, Attendees, Discussion, Decisions, Action items, Next meeting) to keep a clear structure.
- Add **paragraphs** under each section for content. Use **Edit** on a paragraph to change it; changes are saved immediately (no approval).
- **Votes** and **brainstorm** (when available) are recorded as events in the timeline.
- **Finalize minutes** when the record is ready; then **export** (e.g. PDF) to share.

### To-do owner list (“Select owner”) and attendees

- **Owner dropdown:** When adding or editing a to-do, the **Owner** (“Select owner”) list is **all active organization members** (members of the meeting’s organization with status *active*). The app does **not** use meeting-specific attendee tracking for this list: it does not check who is “attending” the meeting. If the list is empty, the organization has no active members (or none that pass the internal filter).
- **Attendees in the minutes:** There is no automatic “who attended” list. To record who was present (and optionally absent), use the **Attendees** section: **Add paragraph** → choose section **Attendees** → enter the list (e.g. names or “Present: … / Absent: …”). That section appears in the timeline and in the exported minutes document. This keeps a single, human-editable list of attendees in the minutes.

### Moderators and permissions

- **Who is a moderator:** meeting creator, active organization representatives, and explicitly invited moderators.
- **Who can manage moderators:** any moderator can add invited moderators; only invited moderators can be removed.
- **Creator/representative moderators** are role-derived and cannot be removed from a meeting by deleting an invitation row.

---

## How each step is displayed to the user

This section describes what the user sees at each step of the meeting and minutes flow.

### 1. Creating a new meeting

- **Where:** Schedule tab → **New meeting** button (or empty state **New meeting**). URL: `#/organization/:orgId/meetings/new`.
- **Display:** Full-page **New meeting** form with:
  - **Back** (ghost button, top left) → returns to Schedule.
  - **Title** (required), **Date / Start time** (required), **End time** (optional), **Location** (optional).
  - **Create video room** (checkbox) and **Paste link** (optional URL).
  - If the user is a representative: **Let participants vote on the date (create scheduling poll)** (checkbox); when checked, date/time fields are hidden and submit creates a poll instead of a meeting.
  - **Cancel** and **Create** (or **Create date poll**) at the bottom.
- **After submit:** Toast “Meeting created” (or “Date poll created…”); redirect to meeting detail page or Schedule tab with poll open.

### 2. Creating a meeting from a scheduling poll

- **Where:** Schedule tab → open a **finalized** poll (chosen slot set) → **Create meeting from this poll**.
- **Display:** Dialog with **Title** (prefilled from poll) and **Create video room** (checkbox). **Cancel** and **Add**.
- **After submit:** Toast “Meeting created”; redirect to meeting detail page.

### 3. Meeting detail page (during or after the meeting)

- **Where:** `#/organization/:orgId/meetings/:meetingId` (from list, calendar, or after create).
- **Display:**
  - **Breadcrumb** (if opened from embedded context): Organization name › Schedule › Meeting title.
  - **Back to list** (ghost button) → returns to Schedule or clears selection.
  - **Meeting title** (heading) and below it: **Date**, **End time** (if set), **Location** (if set), each with label and formatted value.
  - **Video:** If there is a meeting link: **Show video here** / **Open in new tab** (toggle); **Edit meeting** (if user can manage). If no link and user can manage: **Edit meeting** and **Create video room**.
  - **Minutes finalized** (if finalized): Short line with label and timestamp.
  - **Moderator toolbar** (if user is moderator and minutes not finalized): **Start vote**, **Brainstorm**, **Decide on date**, **New document** (coming soon), **Finalize minutes**.
  - **Active vote** (if any): Card with vote title, options, “Cast your vote” or results.
  - **Agenda** (if the first paragraph is “Agenda”): Card titled “Agenda” with the agenda text.
  - **Minutes** card: **Jump to live**, **Add paragraph** (moderators only until finalized); collapsible **Minutes tips**; **Timeline** label; then either “No minutes document yet” or the **timeline** (list of events and paragraphs with type, time, content, and **Edit** on paragraphs for moderators). Empty state: “No entries yet. Add a paragraph to get started.”

### 4. Add paragraph

- **Where:** On meeting detail, inside the Minutes card → **Add paragraph** (moderators only, before finalize).
- **Display:** Dialog **Add paragraph** with:
  - **Section** dropdown: Freeform, Agenda, Attendees, Discussion, Decisions, Action items, Next meeting.
  - **Paragraph text** textarea (placeholder: “Enter paragraph text…”).
  - **Cancel** and **Add paragraph**.
- **Behaviour:** User can choose only section (heading), only text, or both (section + text). With both, two paragraphs are created (heading then body). Content is written directly to the minutes (no approval).
- **After submit:** Dialog closes; toast “Paragraph added.”; timeline refetches and new entry appears immediately.

### 5. Edit paragraph

- **Where:** On meeting detail, in the timeline → **Edit** on a paragraph (moderators only, before finalize).
- **Display:** Dialog **Propose edit to paragraph** with **New text** textarea and hint “Changes are saved immediately.” **Cancel** and **Propose edit** (button label unchanged for reuse).
- **Behaviour:** Submitting updates the paragraph directly (no proposal, no approval).
- **After submit:** Dialog closes; toast “Paragraph updated.”; timeline refetches and updated text is shown.

### 6. Finalize minutes

- **Where:** On meeting detail → **Finalize minutes** (moderators only).
- **Display:** Confirmation dialog: title **Finalize minutes**, text “Finalize minutes? This will lock the minutes document.” **Cancel** and **Finalize minutes**.
- **After confirm:** Toast “Minutes finalized”; meeting refetches; **Minutes finalized** line appears with timestamp; moderator actions (Add paragraph, Edit, Start vote, etc.) are disabled.

### 7. Accessing minutes later

- **Where:** Same URL: `#/organization/:orgId/meetings/:meetingId` (from Schedule “Upcoming meetings” or calendar).
- **Display:** Same layout as during the meeting, but:
  - Video link still available (Show here / New tab).
  - **Minutes finalized** and timestamp shown when applicable.
  - No **Add paragraph**, **Edit**, **Start vote**, or **Finalize minutes** (read-only minutes).
  - Timeline and agenda are read-only; past votes show results.

---

## Quick reference

| Practice | App support |
|----------|-------------|
| Set agenda before meeting | First section “Agenda” in minutes; fill it and share meeting link |
| Structure minutes | Section presets: Attendees, Discussion, Decisions, Action items, Next meeting |
| Record decisions | Add a “Decisions” section and add paragraphs with outcomes |
| Record action items (owner + date) | Add an “Action items” section; include owner and deadline in the text of each item |
| **Structured to-dos** | Use **Add to-do**: title, owner, due date; appear inline in the timeline and at the top of the exported document; owner can mark done after finalization |
| Formal votes | Use “Start vote”; results appear in the timeline |
| Lock the record | “Finalize minutes” when done; export for distribution |
