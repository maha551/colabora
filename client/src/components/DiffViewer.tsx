import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

interface DiffViewerProps {
  originalText: string;
  suggestion1Text?: string;
  suggestion2Text?: string;
  suggestion1Author?: string;
  suggestion2Author?: string;
}

interface DiffSegment {
  text: string;
  type: "original" | "suggestion1" | "suggestion2" | "both";
}

function getDiffSegments(
  original: string,
  suggestion1?: string,
  suggestion2?: string
): DiffSegment[] {
  if (!suggestion1 && !suggestion2) {
    return [{ text: original, type: "original" }];
  }

  // Simple word-based diff
  const originalWords = original.split(/(\s+)/);
  const suggestion1Words = suggestion1 ? suggestion1.split(/(\s+)/) : [];
  const suggestion2Words = suggestion2 ? suggestion2.split(/(\s+)/) : [];

  const segments: DiffSegment[] = [];
  
  // For simplicity, we'll show the full texts with highlighting
  // A more sophisticated diff would use LCS algorithm
  
  // If only one suggestion
  if (suggestion1 && !suggestion2) {
    return highlightDifferences(original, suggestion1, "suggestion1");
  }
  
  if (suggestion2 && !suggestion1) {
    return highlightDifferences(original, suggestion2, "suggestion2");
  }

  // Both suggestions present
  if (suggestion1 && suggestion2) {
    return highlightBothSuggestions(original, suggestion1, suggestion2);
  }

  return [{ text: original, type: "original" }];
}

function highlightDifferences(
  original: string,
  modified: string,
  suggestionType: "suggestion1" | "suggestion2"
): DiffSegment[] {
  const originalWords = original.split(/(\s+)/);
  const modifiedWords = modified.split(/(\s+)/);
  const segments: DiffSegment[] = [];

  const maxLen = Math.max(originalWords.length, modifiedWords.length);
  
  for (let i = 0; i < maxLen; i++) {
    const origWord = originalWords[i] || "";
    const modWord = modifiedWords[i] || "";
    
    if (origWord === modWord) {
      segments.push({ text: origWord, type: "original" });
    } else if (modWord) {
      segments.push({ text: modWord, type: suggestionType });
    }
  }

  return segments;
}

function highlightBothSuggestions(
  original: string,
  suggestion1: string,
  suggestion2: string
): DiffSegment[] {
  // Simplified: show suggestion1 changes in yellow, suggestion2 in blue
  // Where both differ, show as "both"
  const originalWords = original.split(/(\s+)/);
  const s1Words = suggestion1.split(/(\s+)/);
  const s2Words = suggestion2.split(/(\s+)/);
  
  const segments: DiffSegment[] = [];
  const maxLen = Math.max(originalWords.length, s1Words.length, s2Words.length);
  
  for (let i = 0; i < maxLen; i++) {
    const origWord = originalWords[i] || "";
    const s1Word = s1Words[i] || "";
    const s2Word = s2Words[i] || "";
    
    if (origWord === s1Word && origWord === s2Word) {
      segments.push({ text: origWord, type: "original" });
    } else if (s1Word === s2Word && s1Word !== origWord) {
      segments.push({ text: s1Word, type: "both" });
    } else if (s1Word !== origWord && s2Word === origWord) {
      segments.push({ text: s1Word, type: "suggestion1" });
    } else if (s2Word !== origWord && s1Word === origWord) {
      segments.push({ text: s2Word, type: "suggestion2" });
    } else {
      // Both differ from original and from each other
      if (s1Word) {
        segments.push({ text: s1Word, type: "suggestion1" });
      }
      if (s2Word && s2Word !== s1Word) {
        segments.push({ text: " / ", type: "original" });
        segments.push({ text: s2Word, type: "suggestion2" });
      }
    }
  }
  
  return segments;
}

export function DiffViewer({
  originalText,
  suggestion1Text,
  suggestion2Text,
  suggestion1Author,
  suggestion2Author,
}: DiffViewerProps) {
  const segments = getDiffSegments(originalText, suggestion1Text, suggestion2Text);

  return (
    <Card className="p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm">Comparing:</span>
        <Badge variant="outline" className="bg-background">
          Accepted Version
        </Badge>
        {suggestion1Text && (
          <Badge className="bg-amber-500 hover:bg-amber-600">
            {suggestion1Author || "Suggestion 1"}
          </Badge>
        )}
        {suggestion2Text && (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            {suggestion2Author || "Suggestion 2"}
          </Badge>
        )}
      </div>
      
      <div className="p-4 bg-background rounded-md border leading-relaxed">
        {segments.map((segment, index) => {
          if (segment.type === "original") {
            return (
              <span key={index} className="text-foreground">
                {segment.text}
              </span>
            );
          } else if (segment.type === "suggestion1") {
            return (
              <span
                key={index}
                className="bg-amber-200 dark:bg-amber-900/50 text-foreground px-0.5 rounded"
              >
                {segment.text}
              </span>
            );
          } else if (segment.type === "suggestion2") {
            return (
              <span
                key={index}
                className="bg-blue-200 dark:bg-blue-900/50 text-foreground px-0.5 rounded"
              >
                {segment.text}
              </span>
            );
          } else {
            // both
            return (
              <span
                key={index}
                className="bg-gradient-to-r from-amber-200 to-blue-200 dark:from-amber-900/50 dark:to-blue-900/50 text-foreground px-0.5 rounded"
              >
                {segment.text}
              </span>
            );
          }
        })}
      </div>
    </Card>
  );
}
