/**
 * Command suggestion - "Did you mean?" for unknown commands
 */

/**
 * Computes Damerau-Levenshtein distance between two strings.
 * Handles insertions, deletions, substitutions, and transpositions.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));

  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost); // transposition
      }
    }
  }
  return d[la][lb];
}

/**
 * Suggests commands similar to the input.
 * Returns up to 3 suggestions with distance <= 3, sorted by distance.
 * Also matches prefix as a secondary signal.
 */
export function suggestCommands(input: string, commandNames: string[]): string[] {
  const scored: { name: string; distance: number }[] = [];

  for (const name of commandNames) {
    const distance = damerauLevenshtein(input.toLowerCase(), name.toLowerCase());
    if (distance <= 3) {
      scored.push({ name, distance });
    } else if (name.startsWith(input.toLowerCase()) || input.toLowerCase().startsWith(name)) {
      scored.push({ name, distance: 4 }); // prefix match as fallback
    }
  }

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3).map(s => s.name);
}
