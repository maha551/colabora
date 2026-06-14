import { computeDiffSegments, type DiffSegment } from './diffUtils';
import levenshtein from 'fast-levenshtein';

export interface DiffStatistics {
  wordsAdded: number;
  wordsDeleted: number;
  charsAdded: number;
  charsDeleted: number;
  changePercentage: number;
  changeType: 'major' | 'minor' | 'formatting';
}

/**
 * Counts words in a string (handles unicode and whitespace)
 */
function countWords(text: string): number {
  if (!text || text.trim() === '') return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Computes diff statistics between original and suggestion(s)
 */
export function computeDiffStatistics(
  original: string,
  suggestion1?: string,
  suggestion2?: string
): DiffStatistics {
  // Early return for no suggestions
  if (!suggestion1 && !suggestion2) {
    return {
      wordsAdded: 0,
      wordsDeleted: 0,
      charsAdded: 0,
      charsDeleted: 0,
      changePercentage: 0,
      changeType: 'formatting',
    };
  }
  
  // Type-safe: we know at least one suggestion exists
  // Use explicit checks that TypeScript can narrow
  let segments: DiffSegment[] = [];
  let baselineText: string;
  
  if (suggestion1 && suggestion2) {
    // Two suggestions: compare them directly
    segments = computeDiffSegments(suggestion1, suggestion2, 'suggestion2');
    baselineText = suggestion1; // Use suggestion1 as baseline for percentage
  } else if (suggestion1) {
    segments = computeDiffSegments(original, suggestion1, 'suggestion1');
    baselineText = original;
  } else {
    // suggestion2 must be defined (TypeScript can infer this from the early return)
    segments = computeDiffSegments(original, suggestion2, 'suggestion2');
    baselineText = original;
  }

  // Calculate statistics from segments
  let wordsAdded = 0;
  let wordsDeleted = 0;
  let charsAdded = 0;
  let charsDeleted = 0;

  for (const segment of segments) {
    if (segment.type === 'suggestion1' || segment.type === 'suggestion2') {
      wordsAdded += countWords(segment.text);
      charsAdded += segment.text.length;
    } else if (segment.type === 'deleted') {
      wordsDeleted += countWords(segment.text);
      charsDeleted += segment.text.length;
    }
  }

  // Calculate change percentage based on baseline text
  const baselineWordCount = countWords(baselineText);
  const baselineCharCount = baselineText.length;
  
  const totalWordsChanged = wordsAdded + wordsDeleted;
  const totalCharsChanged = charsAdded + charsDeleted;
  
  const wordChangePercentage = baselineWordCount > 0 
    ? (totalWordsChanged / baselineWordCount) * 100 
    : (wordsAdded > 0 ? 100 : 0);
  
  const charChangePercentage = baselineCharCount > 0 
    ? (totalCharsChanged / baselineCharCount) * 100 
    : (charsAdded > 0 ? 100 : 0);
  
  // Use average of word and char change percentages
  const changePercentage = (wordChangePercentage + charChangePercentage) / 2;

  // Determine change type
  let changeType: 'major' | 'minor' | 'formatting' = 'formatting';
  if (changePercentage > 50) {
    changeType = 'major';
  } else if (changePercentage >= 10) {
    changeType = 'minor';
  } else {
    // Check if it's mostly whitespace changes
    const whitespaceOnly = segments.every((seg) => {
      if (seg.type === 'original') return true;
      return seg.text.trim() === '';
    });
    changeType = whitespaceOnly ? 'formatting' : 'minor';
  }

  return {
    wordsAdded,
    wordsDeleted,
    charsAdded,
    charsDeleted,
    changePercentage: Math.round(changePercentage * 10) / 10, // Round to 1 decimal
    changeType,
  };
}

/**
 * Determines the change type based on statistics
 */
export function getChangeType(statistics: DiffStatistics): 'major' | 'minor' | 'formatting' {
  return statistics.changeType;
}

/**
 * Computes similarity score between two texts (0-100)
 * Uses Levenshtein distance algorithm for accurate comparison
 */
export function computeSimilarity(text1: string, text2: string): number {
  if (!text1 && !text2) return 100;
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 100;

  const maxLength = Math.max(text1.length, text2.length);
  if (maxLength === 0) return 100;

  const distance = levenshtein.get(text1, text2);
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 10) / 10;
}

