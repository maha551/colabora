import { create } from 'zustand';
import type { Document, Paragraph, VersionHistory } from '../types';

export interface AgreedViewParagraphPayload {
  text?: string;
  title?: string;
  headingLevel?: string | null;
  history?: VersionHistory[];
}

export interface DocumentState {
  document: Document | null;
  documentLoadKey: number;
  agreedViewRefreshKey: number;
  /** Agreed view document; when set, in-place updates from WebSocket are applied here. */
  agreedDocument: Document | null;
  /** Document id the agreed view is for; must match for in-place updates. */
  agreedDocumentId: string | null;
  loading: boolean;
  error: string | null;
  setDocument: (doc: Document | null) => void;
  setDocumentLoadKey: (key: number) => void;
  bumpDocumentLoadKey: () => void;
  incrementAgreedViewRefreshKey: () => void;
  /** Set agreed view (e.g. after fetch). Pass doc and its id; null clears. */
  setAgreedDocument: (doc: Document | null, forDocumentId?: string) => void;
  /** Merge a paragraph update into agreed view in-place (no refetch). No-op if agreed view is for another document. */
  updateAgreedViewParagraph: (documentId: string, paragraphId: string, payload: AgreedViewParagraphPayload) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

function mergeHistory(existing: VersionHistory[], incoming: VersionHistory[]): VersionHistory[] {
  if (!incoming?.length) return existing;
  const byId = new Map<string, VersionHistory>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    const at = a.acceptedAt instanceof Date ? a.acceptedAt.getTime() : new Date(a.acceptedAt as unknown as string).getTime();
    const bt = b.acceptedAt instanceof Date ? b.acceptedAt.getTime() : new Date(b.acceptedAt as unknown as string).getTime();
    return at - bt;
  });
  return merged;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  document: null,
  documentLoadKey: Date.now(),
  agreedViewRefreshKey: 0,
  agreedDocument: null,
  agreedDocumentId: null,
  loading: false,
  error: null,
  setDocument: (document) => set({ document }),
  setDocumentLoadKey: (documentLoadKey) => set({ documentLoadKey }),
  bumpDocumentLoadKey: () => set((s) => ({ documentLoadKey: Date.now() })),
  incrementAgreedViewRefreshKey: () =>
    set((s) => ({ agreedViewRefreshKey: s.agreedViewRefreshKey + 1 })),
  setAgreedDocument: (doc, forDocumentId) =>
    set({
      agreedDocument: doc,
      agreedDocumentId: doc ? (forDocumentId ?? doc.id) : null,
    }),
  updateAgreedViewParagraph: (documentId, paragraphId, payload) => {
    const { agreedDocument, agreedDocumentId } = get();
    if (!agreedDocument || agreedDocumentId !== documentId) return;
    const { text, title, headingLevel, history: incomingHistory } = payload;
    set({
      agreedDocument: {
        ...agreedDocument,
        paragraphs: agreedDocument.paragraphs.map((p: Paragraph) => {
          if (p.id !== paragraphId) return p;
          const nextHistory = incomingHistory?.length
            ? mergeHistory(p.history || [], incomingHistory)
            : p.history;
          return {
            ...p,
            ...(text !== undefined && { text }),
            ...(title !== undefined && { title }),
            ...(headingLevel !== undefined && { headingLevel }),
            ...(nextHistory && { history: nextHistory }),
          };
        }),
      },
    });
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
