export interface ChatSuggestion {
  id: string;
  name: string;
  /** Day number if from a tool call, undefined if from text parsing */
  day?: number;
  location?: string;
  sourceMessageIndex: number;
  coordinates?: [number, number];
}

// Time-of-day prefixes to strip before trying to extract a place name
const TIME_PREFIXES_RE = /^(morning|afternoon|evening|night|lunch|dinner|breakfast|בוקר|צהריים|אחר[ \u05d4]?\u05e6\u05d4\u05e8\u05d9\u05d9\u05dd|ערב|לילה|בין[ \u05d4]?\u05e9\u05de\u05e9\u05d5\u05ea)\s*[:\-–—]\s*/i;

// Generic activity phrases that are NOT place names
const GENERIC_PHRASES_RE = /^(lunch|dinner|breakfast|ארוחת?\s+(צהריים|ערב|בוקר|חצות)|driving|drive|travel|getting|check.?in|check.?out|rest|relax|free time|נסיעה|נהיגה|מנוחה|חזרה)\b/i;

/**
 * Parse bullet/numbered list items from an AI TEXT message as place suggestions.
 * Filters out questions, time-of-day markers, and generic activity descriptions.
 * Used as fallback when the AI gives recommendations without a tool call.
 */
export function parseSuggestionsFromMessage(
  text: string,
  messageIndex: number,
): Array<Omit<ChatSuggestion, 'id' | 'coordinates'>> {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const results: Array<Omit<ChatSuggestion, 'id' | 'coordinates'>> = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match bullet: "- item", "• item", "* item"
    const bullet = trimmed.match(/^[-•*]\s+(.+)$/);
    // Match numbered: "1. item", "1) item"
    const numbered = !bullet ? trimmed.match(/^\d+[.)]\s+(.+)$/) : null;

    const raw = (bullet?.[1] ?? numbered?.[1])?.trim();
    if (!raw) continue;

    // Skip questions
    if (raw.trimEnd().endsWith('?')) continue;

    // Strip "Morning: " / "בוקר: " style prefixes
    const stripped = raw.replace(TIME_PREFIXES_RE, '').trim();
    if (!stripped) continue;

    // Skip generic activity phrases
    if (GENERIC_PHRASES_RE.test(stripped)) continue;

    const name = stripped
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/__/g, '')
      // Remove " — description" or " - description" suffixes
      .replace(/\s+[—–-]\s+.+$/, '')
      // Remove trailing colon
      .replace(/:$/, '')
      .trim();

    const key = name.toLowerCase();
    if (name.length >= 3 && name.length <= 80 && !seen.has(key)) {
      seen.add(key);
      results.push({ name, sourceMessageIndex: messageIndex });
    }
  }

  return results;
}

/**
 * Build suggestions from a set_itinerary tool call.
 * These are always clean, structured place names — preferred over text parsing.
 */
export function suggestionsFromToolCall(
  places: Array<{ name: string; day?: number; location?: string }>,
  messageIndex: number,
): Array<Omit<ChatSuggestion, 'id' | 'coordinates'>> {
  const seen = new Set<string>();
  return places
    .filter(p => p.name && p.name.length >= 2)
    .filter(p => {
      const key = p.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(p => ({ name: p.name, day: p.day, location: p.location, sourceMessageIndex: messageIndex }));
}
