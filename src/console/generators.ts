/**
 * Content generators (meta descriptions, titles, article outlines) — open
 * source only: deterministic French templates by default, and optionally a
 * self-hosted open model through Ollama (OLLAMA_URL + OLLAMA_MODEL). No paid API.
 */

export interface GenInput { keyword: string; brand?: string; topic?: string; audience?: string; benefit?: string; existingTitle?: string; existingHeadings?: string[]; }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);
const uniq = <T>(a: T[]) => [...new Set(a)];

export function generateTitles(input: GenInput): { text: string; chars: number }[] {
  const k = cap(input.keyword.trim());
  const b = input.brand?.trim();
  const year = new Date().getFullYear();
  const suffix = b ? ` | ${b}` : "";
  const benefit = input.benefit?.trim();
  const list = [
    `${k} : le guide complet ${year}${suffix}`,
    `${k} — ${benefit ? cap(benefit) : "méthode, outils et conseils"}${suffix}`,
    `Comment réussir votre ${input.keyword.trim().toLowerCase()} en 5 étapes${suffix}`,
    `${k} : erreurs à éviter et bonnes pratiques${suffix}`,
    `${k}${input.audience ? ` pour ${input.audience}` : ""} : tout comprendre${suffix}`,
    input.existingTitle ? `${clip(input.existingTitle, 45)} — ${k}` : `${k} : comparatif et prix${suffix}`,
  ];
  return uniq(list).map((t) => clip(t, 65)).map((text) => ({ text, chars: text.length }));
}

export function generateMetaDescriptions(input: GenInput): { text: string; chars: number }[] {
  const k = input.keyword.trim().toLowerCase();
  const b = input.brand?.trim();
  const who = input.audience ? ` pour ${input.audience}` : "";
  const benefit = input.benefit?.trim() || "gagner du temps et obtenir des résultats mesurables";
  const list = [
    `Découvrez tout sur ${k}${who} : méthode pas à pas, exemples concrets et conseils pour ${benefit}.${b ? ` Par ${b}.` : ""}`,
    `${cap(k)} : nos experts vous expliquent comment ${benefit}. Guide clair, checklist et erreurs à éviter.`,
    `Vous cherchez ${k} ? ${b ?? "Nous"} vous aide${b ? "" : "ons"} à ${benefit}. Comparez les options et passez à l'action dès aujourd'hui.`,
    `Guide ${k} ${new Date().getFullYear()} : définitions, étapes clés, outils recommandés et FAQ. Tout pour ${benefit}.`,
  ];
  return list.map((t) => clip(t.replace(/\s+/g, " "), 158)).map((text) => ({ text, chars: text.length }));
}

export function generateOutline(input: GenInput): { h1: string; sections: { h2: string; h3: string[] }[]; faq: string[] } {
  const k = input.keyword.trim().toLowerCase();
  const sections = [
    { h2: `Qu'est-ce que ${k} ?`, h3: ["Définition", "Pourquoi c'est important", "Les chiffres clés"] },
    { h2: `Comment fonctionne ${k}`, h3: ["Les étapes", "Les outils nécessaires", "Exemple concret"] },
    { h2: `Les avantages de ${k}${input.audience ? ` pour ${input.audience}` : ""}`, h3: ["Gains attendus", "Limites à connaître"] },
    { h2: `Les erreurs fréquentes en ${k}`, h3: ["Erreurs techniques", "Erreurs de stratégie"] },
    { h2: `Combien coûte ${k} ?`, h3: ["Fourchettes de prix", "Faire soi-même ou se faire accompagner"] },
    { h2: "Checklist pour passer à l'action", h3: [] },
  ];
  for (const h of input.existingHeadings ?? []) {
    if (!sections.some((s) => s.h2.toLowerCase() === h.toLowerCase())) sections.splice(sections.length - 1, 0, { h2: h, h3: [] });
  }
  return {
    h1: generateTitles(input)[0].text.replace(/ \| .*$/, ""),
    sections: sections.slice(0, 10),
    faq: [`${cap(k)}, c'est quoi exactement ?`, `Combien de temps faut-il pour voir des résultats avec ${k} ?`, `Quels outils gratuits pour ${k} ?`, `${cap(k)} : faut-il un expert ?`],
  };
}

export interface OllamaConfig { url: string; model: string; }
export function ollamaFromEnv(env: NodeJS.ProcessEnv = process.env): OllamaConfig | null {
  return env.OLLAMA_URL ? { url: env.OLLAMA_URL.replace(/\/$/, ""), model: env.OLLAMA_MODEL || "mistral" } : null;
}

export async function generateWithOllama(kind: "titles" | "meta" | "outline", input: GenInput, config: OllamaConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const ask = {
    titles: "Propose 6 balises title SEO (60 caractères max chacune), une par ligne, sans numérotation.",
    meta: "Propose 4 meta descriptions SEO (150 à 158 caractères), une par ligne, sans numérotation.",
    outline: "Propose un plan d'article SEO : un H1, puis des H2 et H3 en Markdown, puis une FAQ de 4 questions.",
  }[kind];
  const prompt = `Tu es un rédacteur SEO francophone. Mot-clé principal : « ${input.keyword} ».${input.brand ? ` Marque : ${input.brand}.` : ""}${input.audience ? ` Public : ${input.audience}.` : ""}${input.benefit ? ` Bénéfice : ${input.benefit}.` : ""}${input.topic ? ` Contexte de la page : ${input.topic.slice(0, 1500)}` : ""}\n${ask}\nRéponds uniquement en français.`;
  const res = await fetchImpl(`${config.url}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model, prompt, stream: false, options: { temperature: 0.6 } }), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return ((await res.json()) as { response?: string }).response?.trim() ?? "";
}
