/**
 * Document Utility Functions
 * 
 * Provides utility functions for working with documents
 */

/**
 * Get document initials from title
 * - If title has 2+ words: First letter of first 2 words (e.g., "Project Proposal" -> "PP")
 * - If title has 1 word: First 2 letters (e.g., "Meeting" -> "ME")
 * - If title is empty: "??"
 */
export function getDocumentInitials(title: string): string {
  if (!title || title.trim().length === 0) {
    return '??';
  }
  
  const words = title.trim().split(/\s+/).filter(word => word.length > 0);
  
  if (words.length >= 2) {
    // Two or more words: use first letter of first two words
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    // Single word: use first two letters
    const word = words[0];
    return word.length >= 2 
      ? word.substring(0, 2).toUpperCase()
      : (word[0] + word[0]).toUpperCase(); // Repeat if only one char
  }
  
  return '??';
}
