import { diff_match_patch } from 'diff-match-patch';

export interface DiffSegment {
  text: string;
  type: "original" | "suggestion1" | "suggestion2" | "deleted";
}

/**
 * Computes diff segments between original and modified text using diff-match-patch.
 * Uses Myers diff algorithm for accurate comparison even with reordered text.
 */
export function computeDiffSegments(
  original: string,
  modified: string,
  suggestionType: "suggestion1" | "suggestion2"
): DiffSegment[] {
  // Handle empty original text - treat everything as new
  if (!original || original.trim() === '') {
    if (!modified || modified.trim() === '') {
      return [{ text: '', type: "original" }];
    }
    // All text is new
    return [{ text: modified, type: suggestionType }];
  }

  // Handle empty modified text - everything was deleted
  if (!modified || modified.trim() === '') {
    return [{ text: original, type: "deleted" }];
  }

  // Use diff-match-patch for accurate diff computation
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(original, modified);
  
  // Cleanup semantic chunks for better word-level grouping
  dmp.diff_cleanupSemantic(diffs);

  // Convert diff-match-patch format to DiffSegment format
  const segments: DiffSegment[] = [];
  
  for (const [operation, text] of diffs) {
    if (operation === -1) {
      // Deletion: text exists in original but not in modified
      segments.push({ text, type: "deleted" });
    } else if (operation === 0) {
      // Equal: text exists in both
      segments.push({ text, type: "original" });
    } else if (operation === 1) {
      // Insertion: text exists in modified but not in original
      segments.push({ text, type: suggestionType });
    }
  }

  return segments;
}

/**
 * Extracts surrounding text context around changes for preview display.
 * Uses diff-match-patch to find change boundaries and extracts text before/after.
 */
export function getContextPreview(
  originalText: string,
  suggestionText: string,
  contextLength: number = 50
): {
  before: string;
  after: string;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  changeStart: number;
  changeEnd: number;
} {
  // Handle edge cases
  if (!originalText && !suggestionText) {
    return {
      before: '',
      after: '',
      hasMoreBefore: false,
      hasMoreAfter: false,
      changeStart: 0,
      changeEnd: 0,
    };
  }

  if (!originalText || originalText.trim() === '') {
    // All new content
    return {
      before: '',
      after: suggestionText.substring(0, contextLength),
      hasMoreBefore: false,
      hasMoreAfter: suggestionText.length > contextLength,
      changeStart: 0,
      changeEnd: 0,
    };
  }

  if (!suggestionText || suggestionText.trim() === '') {
    // All content removed
    return {
      before: originalText.substring(Math.max(0, originalText.length - contextLength)),
      after: '',
      hasMoreBefore: originalText.length > contextLength,
      hasMoreAfter: false,
      changeStart: 0,
      changeEnd: originalText.length,
    };
  }

  // Use diff-match-patch to find change boundaries
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(originalText, suggestionText);
  dmp.diff_cleanupSemantic(diffs);

  // Find first change position in original text
  let changeStart = 0;
  let foundFirstChange = false;
  
  for (const [operation, text] of diffs) {
    if (operation !== 0) {
      // Found first change
      foundFirstChange = true;
      break;
    }
    changeStart += text.length;
  }

  // Find last change position in original text
  let changeEnd = originalText.length;
  let pos = originalText.length;
  
  for (let i = diffs.length - 1; i >= 0; i--) {
    const [operation, text] = diffs[i];
    if (operation !== 0) {
      // Found last change
      break;
    }
    pos -= text.length;
  }
  changeEnd = pos;

  // If no changes found, texts are identical
  if (!foundFirstChange) {
    return {
      before: originalText.substring(Math.max(0, originalText.length - contextLength)),
      after: '',
      hasMoreBefore: originalText.length > contextLength,
      hasMoreAfter: false,
      changeStart: 0,
      changeEnd: 0,
    };
  }

  // Extract context before and after changes
  const beforeStart = Math.max(0, changeStart - contextLength);
  const afterEnd = Math.min(originalText.length, changeEnd + contextLength);

  const before = originalText.substring(beforeStart, changeStart);
  const after = originalText.substring(changeEnd, afterEnd);

  return {
    before,
    after,
    hasMoreBefore: beforeStart > 0,
    hasMoreAfter: afterEnd < originalText.length,
    changeStart,
    changeEnd,
  };
}

