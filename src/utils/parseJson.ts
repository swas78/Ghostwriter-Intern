export function parseJson<T>(raw: string): T {
  let cleaned = raw.trim();
  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines[0].startsWith('```')) {
      lines.shift(); // remove first line
    }
    if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) {
      lines.pop(); // remove last line
    }
    cleaned = lines.join('\n').trim();
  }
  return JSON.parse(cleaned) as T;
}
