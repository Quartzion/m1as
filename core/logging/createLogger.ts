import fs from "fs";
import path from "path";

export type m1asLogger = (log: Record<string, any>) => void;

export function createLogger(mode: string, options?: { filePath?: string }): m1asLogger | undefined {
  if (mode === "none") return undefined;

  if (mode === "console") {
    return (log) => {
      console.log(JSON.stringify(log));
    };
  }

  if (mode === "file") {
    if (!options?.filePath) {
      throw new Error("File logger requires M1AS_LOG_FILE");
    }

    const stream = fs.createWriteStream(path.resolve(options.filePath), { flags: "a" });

    return (log) => {
      stream.write(JSON.stringify(log) + "\n");
    };
  }

  if (mode === "cloud") {
    return (log) => {
      // placeholder — integrators override this
      console.log(JSON.stringify({ cloud: true, ...log }));
    };
  }

  throw new Error(`Unknown logger mode: ${mode}`);
}