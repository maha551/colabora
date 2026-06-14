# Guest scheduling

Account-free participation in date polls via a single share link that evolves through the meeting lifecycle.

## For organizers

1. Create a date poll (Schedule tab or from meeting minutes **Decide on date**).
2. Add time slots and open the poll detail page.
3. Click **Copy guest link** and share the URL (email, chat, etc.).
4. Guest responses appear in the poll grid (merged with member responses) and under **Guest responses**.
5. Use the **Suggested time** banner to pick the best slot, then **Finalize poll**.
6. **Create meeting from poll** — the same guest link now shows the meeting time and video join button.
7. After **Finalize minutes**, the guest link includes read-only meeting minutes.

To invalidate old links, use **Regenerate guest link** (old URLs stop working immediately).

## For guests

1. Open the link — no account or login required.
2. Optionally enter your name (shown to organizers only).
3. Tap times on the grid (yes / no / maybe) and click **Save availability**.
4. Bookmark the page to update your answers later (your browser remembers you).
5. Return after the date is set to see the scheduled time, join the video call, and read finalized minutes.

## Security

- Each link is scoped to one poll only.
- Links expire (30 days while open; extended after finalize).
- Only finalized minutes are visible to guests — never draft content.
- Rate limits apply to prevent abuse.

## Technical reference

- Guest page: `/guest/poll/:token`
- Public API: `GET/PUT /api/public/guest/polls/:token`
- See [BACKEND_ROUTES.md](../api/BACKEND_ROUTES.md) for API details.
