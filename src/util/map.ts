export function toMap<T, K, V>(items: T[], key: (item: T) => K, value: (item: T) => V): Map<K, V> {
    const map = new Map<K, V>();
    for (const item of items) {
        map.set(key(item), value(item));
    }
    return map;
}

export function upsertMap<K, V>(map: Map<K, V>, key: K, updater: (value?: V) => V) {
    const value = map.get(key);
    if (value !== undefined) {
        map.set(key, updater(value));
    } else {
        map.set(key, updater());
    }
}
