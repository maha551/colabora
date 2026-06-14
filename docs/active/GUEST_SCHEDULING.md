# Guest scheduling

Account-free participation in date polls via a single share link that evolves through the meeting lifecycle.

## For organizers

1. Create a date poll (Schedule tab or from meeting minutes **Decide on date**). Set a **participation deadline** (default 3 days); members and guests can respond until then.
2. Add time slots and open the poll detail page.
3. Click **Copy guest link** and share the URL (email, chat, etc.).
4. Guest responses appear in the poll grid (merged with member responses) and under **Guest responses**.
5. When the deadline passes (or you **Close participation** early), responses stop; organizers are notified.
6. Use the **Suggested time** banner to pick the best slot, then **Finalize poll**.
7. **Create meeting from poll** — the same guest link now shows the meeting time and video join button.
8. After **Finalize minutes**, the guest link includes read-only meeting minutes.

Organizers can **extend the deadline** to reopen participation if needed.

To invalidate old links, use **Regenerate guest link** (old URLs stop working immediately).

## For guests

1. Open the link — no account or login required.
2. Optionally enter your name (shown to organizers only).
3. Tap times on the grid (yes / no / maybe) and click **Save availability** before the participation deadline.
4. Bookmark the page to update your answers later (your browser remembers you) while the poll is open.
5. After participation closes, the grid is read-only.
6. Return after the date is set to see the scheduled time, join the video call, and read finalized minutes.

## Security

- Each link is scoped to one poll only.
- Links expire (30 days while open; extended after finalize).
- Only finalized minutes are visible to guests — never draft content.
- Rate limits apply to prevent abuse.

## Technical reference

- Guest page: `/guest/poll/:token`
- Public API: `GET/PUT /api/public/guest/polls/:token`
- See [BACKEND_ROUTES.md](../api/BACKEND_ROUTES.md) for API details.
