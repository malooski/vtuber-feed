export function popMany<T>(arr: T[], count: number): T[] {
    const popped: T[] = [];
    const safeCount = Math.min(count, arr.length);
    for (let i = 0; i < safeCount; i++) {
        const item = arr.pop()!;
        popped.push(item);
    }
    return popped;
}
