export function validateLocalToday(localToday: string | null | undefined): string {
  if (!localToday) {
    throw new Error("local_today is required");
  }
  
  // YYYY-MM-DD format check
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(localToday)) {
    throw new Error(`Invalid local_today format: ${localToday}. Expected YYYY-MM-DD.`);
  }

  // Sanity check against server UTC time.
  // We compare client midnight (UTC representation) against server time.
  const clientTime = new Date(`${localToday}T00:00:00Z`).getTime();
  const serverTime = Date.now();
  
  if (isNaN(clientTime)) {
    throw new Error(`Invalid date string: ${localToday}`);
  }

  const diffHours = Math.abs(serverTime - clientTime) / (1000 * 60 * 60);
  
  // A client's "today" can at most be +/- 14-24 hours from server UTC. 
  // 48 hours provides a safe buffer for edge cases while blocking blatantly wrong clocks (e.g., year 1970 or future).
  if (diffHours > 48) {
    console.warn(`[WARNING] local_today (${localToday}) is implausibly far from server UTC (${new Date(serverTime).toISOString()}). Difference: ${diffHours.toFixed(1)} hours.`);
    throw new Error("local_today is too far from server time. Check your system clock.");
  }

  return localToday;
}
