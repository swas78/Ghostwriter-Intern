export function parseJson<T>(raw: string): T {
  let cleaned = raw.trim();
  
  // Try standard parse first
  try {
    // Strip markdown fences
    let noFences = cleaned;
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      noFences = match[1].trim();
    } else {
      if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) lines.pop();
        noFences = lines.join('\n').trim();
      }
    }
    return JSON.parse(noFences) as T;
  } catch (e) {
    // If it fails, maybe there's conversational text before/after. Extract { ... }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end >= start) {
      const extracted = cleaned.substring(start, end + 1);
      return JSON.parse(extracted) as T;
    }
    throw e;
  }
}
