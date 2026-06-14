# Protocol canvas parity matrix

| Protocol type | Adapter ([protocolBlocks.ts](protocolBlocks.ts)) | Renderer | Primary insertion |
|---------------|--------------------------------------------------|----------|-------------------|
| `paragraph` | Timeline `paragraph` → paragraph or decision by section | [ParagraphBlock.tsx](renderers/ParagraphBlock.tsx) | BlockInserter / SlashCommandMenu / action bar |
| `decision` | Paragraph with decisions section / title Decisions | [DecisionBlock.tsx](renderers/DecisionBlock.tsx) | Record decision dialog |
| `brainstorm` | Events `brainstorm_started` / `brainstorm_ended` | [BrainstormBlock.tsx](renderers/BrainstormBlock.tsx) | Start brainstorm |
| `vote` | Events `vote_started` / `vote_ended` | [VoteBlock.tsx](renderers/VoteBlock.tsx) | Start vote |
| `date_poll` | Event `date_decided` | [DatePollBlock.tsx](renderers/DatePollBlock.tsx) | Decide on date |
| `todo` | Timeline `todo` | [TodoBlock.tsx](renderers/TodoBlock.tsx) | Add to-do |
| `document_link` | Event `document_created` | [DocumentLinkBlock.tsx](renderers/DocumentLinkBlock.tsx) | New document |
| `agenda_item` | From agenda list (not in BlockCanvas list; sections in panel) | Visual sections in [MeetingMinutesPanel.tsx](../MeetingMinutesPanel.tsx) | Add agenda item |

## Tests

- Adapter: [__tests__/protocolBlocks.test.ts](__tests__/protocolBlocks.test.ts)
- Renderer shell: [__tests__/BlockRenderer.test.tsx](__tests__/BlockRenderer.test.tsx)
- Canvas: [__tests__/BlockCanvas.test.tsx](__tests__/BlockCanvas.test.tsx)
