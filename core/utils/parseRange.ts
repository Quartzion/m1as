export interface ByteRange {
    start: number;
    end?: number;
}

export function parseRangeHeader (
    rangeHeader?: string
): ByteRange | undefined {
    if(!rangeHeader) return undefined;

    const match = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);

    if(!match) return undefined;

    return {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : undefined,
    };
} 