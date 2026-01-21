import fs from "fs";
import path from "path";

export type m1asLogger = (log: Record<string, any>) => void;

const LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = typeof LEVELS[number];

function levelRank(level: LogLevel) {
  return LEVELS.indexOf(level);
}


export function createLogger(
    mode: string, 
    options?: { filePath?: string; level?: LogLevel }
    ): m1asLogger | undefined {
    if (mode === "none") return undefined;

    const minLevel = options?.level ?? "info";

    const m1asLoggerLvl  = (log: Record<string, any>) => {
        const lvl = (log.level ?? "info" as LogLevel)
        return levelRank(lvl) <= levelRank(minLevel);
    };

    if (mode === "console") {
        return (log) => {
            if (!m1asLoggerLvl(log)) return;
            console.log(JSON.stringify(log));
        };
    }

    if (mode === "file") {
        if (!options?.filePath) {
            console.warn("File logger disabled: M1AS_LOG_FILE not set");
            return undefined;
        }

        try {

            const dir = path.dirname(options.filePath);
            fs.mkdirSync(dir, { recursive: true });


            const stream = fs.createWriteStream(
                path.resolve(options.filePath),
                { flags: "a" }
            );

            return (log) => {
                if (!m1asLoggerLvl(log)) return;
                try {
                    stream.write(JSON.stringify(log) + "\n");
                } catch { }
            };
        } catch (err) {
            console.warn("Failed to initialize file logger:", err);
            return undefined;
        }
    }

    if (mode === "cloud") {
        return (log) => {
            // placeholder — integrators override this
            console.log(JSON.stringify({ cloud: true, ...log }));
        };
    }

    throw new Error(`Unknown logger mode: ${mode}`);
}