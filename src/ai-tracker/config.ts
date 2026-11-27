/** Native AI tracker — feature flags. Fail-closed: everything off by default. */

export interface TrackerConfig {
  enabled: boolean;
  scraperEngines: Record<string, boolean>;
  ollamaUrl: string;
  ollamaModel: string;
  runHour: string;
  defaultLocale: string;
  dbPath: string;
  sessionDir: string;
}

const SCRAPER_ENGINES = ["chatgpt", "gemini", "google-ai-mode", "perplexity", "bing-ai-mode"] as const;
const flag = (name: string) => String(process.env[name] ?? "").trim().toLowerCase() === "true";

export function trackerConfig(): TrackerConfig {
  const scraperEngines: Record<string, boolean> = {};
  for (const engine of SCRAPER_ENGINES) scraperEngines[engine] = flag(`AI_TRACKER_SCRAPER_${engine.toUpperCase().replace(/-/g, "_")}_ENABLED`);
  return {
    enabled: flag("AI_TRACKER_ENABLED"),
    scraperEngines,
    ollamaUrl: process.env.OLLAMA_URL ?? "http://ollama:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:14b",
    runHour: /^\d{2}:\d{2}$/.test(process.env.AI_TRACKER_RUN_HOUR ?? "") ? process.env.AI_TRACKER_RUN_HOUR! : "07:00",
    defaultLocale: process.env.AI_TRACKER_LOCALE_DEFAULT ?? "fr-FR",
    dbPath: process.env.AI_TRACKER_DB_PATH ?? "data/ai-tracker.sqlite3",
    sessionDir: process.env.AI_TRACKER_SCRAPER_SESSION_DIR ?? "data/ai-tracker-sessions",
  };
}

/** Global kill-switch: no collection, no scheduling, when disabled. */
export function trackerEnabled(): boolean { return trackerConfig().enabled; }

/** Per-engine scraper flag; also requires the global flag. */
export function scraperEnabled(engine: string): boolean {
  const config = trackerConfig();
  return config.enabled && (config.scraperEngines[engine] ?? false);
}

/** Judge version is stored with every judgement (never overwritten). */
export function judgeVersion(): string {
  const model = trackerConfig().ollamaModel.replace(/[^a-zA-Z0-9._-]/g, "");
  return `ollama-${model}-v1`;
}
