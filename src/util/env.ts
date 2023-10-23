export function maybeStr(name: string) {
    const val = process.env[name];
    if (!val) return undefined;
    return val;
}

export function maybeInt(name: string) {
    const val = process.env[name];
    if (!val) return undefined;
    const int = parseInt(val, 10);
    if (isNaN(int)) return undefined;
    return int;
}
