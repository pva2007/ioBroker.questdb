import type { DatapointCustomConfig } from './types';

export class ObjectCache {
    private readonly cache = new Map<string, DatapointCustomConfig | null>();

    set(id: string, config: DatapointCustomConfig | null): void {
        this.cache.set(id, config);
    }

    /** Returns undefined if not yet loaded, null if loaded but not enabled */
    get(id: string): DatapointCustomConfig | null | undefined {
        return this.cache.get(id);
    }

    delete(id: string): void {
        this.cache.delete(id);
    }

    clear(): void {
        this.cache.clear();
    }
}
