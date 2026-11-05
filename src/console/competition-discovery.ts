/** Provisional candidates are fragments found in answers, never confirmed brands. */
export function discoverCandidates(rows: Array<{ id: string; answer: string; prompt: string; source: string }>, aliases: string[]) {
  const known = new Set(aliases.map((s) => s.toLocaleLowerCase()));
  const candidates = new Map<string, { name: string; count: number; evidence: Array<{ responseId: string; prompt: string; source: string; excerpt: string }> }>();
  const stop = new Set(["the", "this", "that", "these", "pour", "avec", "dans", "vous", "notre", "leur", "leurs", "les", "une", "des", "mais", "voici", "selon", "par", "enfin", "however", "also", "when", "best"]);
  for (const row of rows) {
    const seen = new Set<string>();
    for (const match of row.answer.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}&.-]{2,}(?:[ \t]+\p{Lu}[\p{L}\p{N}&.-]{2,}){0,2}/gu)) {
      const name = match[0].trim(), key = name.toLocaleLowerCase();
      if (known.has(key) || stop.has(key) || seen.has(key) || /^\d/.test(name)) continue;
      seen.add(key); const candidate = candidates.get(key) ?? { name, count: 0, evidence: [] }; candidate.count++;
      if (candidate.evidence.length < 3) candidate.evidence.push({ responseId: row.id, prompt: row.prompt, source: row.source, excerpt: row.answer.slice(Math.max(0, match.index! - 80), Math.min(row.answer.length, match.index! + name.length + 80)) });
      candidates.set(key, candidate);
    }
  }
  return [...candidates.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 100);
}
