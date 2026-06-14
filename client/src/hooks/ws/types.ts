import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { Document, User } from '../../types';
import type { AppView } from '../../types';
import type { DocumentUpdate } from '../useWebSocket';
import type { AgreedViewParagraphPayload } from '../../stores/useDocumentStore';

export interface WebSocketUpdatesContext {
  updateDocument: Dispatch<SetStateAction<Document | null>>;
  reloadDocument: (force?: boolean) => Promise<void>;
  currentDocument: Document | null;
  currentUser: User | null;
  currentView: AppView;
  onAgreedViewRefresh?: () => void;
  /** In-place merge of a paragraph update into agreed view (no refetch). */
  onAgreedViewParagraphUpdate?: (documentId: string, paragraphId: string, payload: AgreedViewParagraphPayload) => void;
  setVotingState: Dispatch<SetStateAction<Set<string>>>;
  t: (key: string, options?: Record<string, unknown>) => string;
  pendingOperationsRef: MutableRefObject<Map<string, NodeJS.Timeout>>;
}

export type ProcessUpdateHandler = (update: DocumentUpdate) => void;
