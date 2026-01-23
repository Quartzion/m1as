import fs from "fs";
import path from "path";

/* ----------------------------------
 * Log levels
 * ---------------------------------- */

export const LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = typeof LEVELS[number];

function levelRank(level: LogLevel) {
  return LEVELS.indexOf(level);
}

/* ----------------------------------
 * Log entry + logger types
 * ---------------------------------- */

export interface LogEntry {
  level: LogLevel;
  msg: string;
  time?: number;
  [key: string]: unknown;
}

export type m1asLogger = (entry: LogEntry) => void;

/* ----------------------------------
 * Logger factory
 * ---------------------------------- */

export function createLogger(
  mode: "none" | "console" | "file" | "cloud",
  options?: {
    filePath?: string;
    level?: LogLevel;
  }
): m1asLogger | undefined {
  if (mode === "none") return undefined;

  const minLevel = options?.level ?? "info";

  const shouldLog = (entry: LogEntry) =>
    levelRank(entry.level) <= levelRank(minLevel);

  const normalize = (entry: LogEntry) => ({
    time: entry.time ?? Date.now(),
    ...entry,
  });

  /* ---------- console logger ---------- */

  if (mode === "console") {
    return (entry) => {
      if (!shouldLog(entry)) return;
      console.log(JSON.stringify(normalize(entry)));
    };
  }

  /* ---------- file logger ---------- */

  if (mode === "file") {
    if (!options?.filePath) {
      console.warn("File logger disabled: filePath not set");
      return undefined;
    }

    try {
      const dir = path.dirname(options.filePath);
      fs.mkdirSync(dir, { recursive: true });

      const stream = fs.createWriteStream(
        path.resolve(options.filePath),
        { flags: "a" }
      );

      return (entry) => {
        if (!shouldLog(entry)) return;
        try {
          stream.write(JSON.stringify(normalize(entry)) + "\n");
        } catch {
          /* swallow logging errors */
        }
      };
    } catch (err) {
      console.warn("Failed to initialize file logger:", err);
      return undefined;
    }
  }

  /* ---------- cloud logger (hook) ---------- */

  if (mode === "cloud") {
    return (entry) => {
      if (!shouldLog(entry)) return;
      console.log(JSON.stringify({ cloud: true, ...normalize(entry) }));
    };
  }

  throw new Error(`Unknown logger mode: ${mode}`);
}
