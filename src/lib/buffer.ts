import type { PendingWrite } from './types';

export class WriteBuffer {
    private readonly pending = new Map<string, PendingWrite>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readyBatch: PendingWrite[] = [];
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(
        private readonly flushCallback: (rows: PendingWrite[]) => Promise<void>,
        private readonly defaultDebounceMs: number,
        private readonly maxBatchSize: number,
        private readonly flushIntervalMs: number,
    ) {
        if (flushIntervalMs > 0) {
            this.flushTimer = setInterval(() => {
                void this.flushReadyBatch();
            }, flushIntervalMs);
        }
    }

    enqueue(row: PendingWrite, debounceMs: number): void {
        const key = row.stateId;

        const existingTimer = this.timers.get(key);
        if (existingTimer !== undefined) {
            clearTimeout(existingTimer);
            this.timers.delete(key);
        }

        if (debounceMs === 0) {
            this.pending.delete(key);
            this.addToReadyBatch(row);
            return;
        }

        this.pending.set(key, row);

        const timer = setTimeout(() => {
            this.timers.delete(key);
            const pendingRow = this.pending.get(key);
            if (pendingRow !== undefined) {
                this.pending.delete(key);
                this.addToReadyBatch(pendingRow);
            }
        }, debounceMs);

        this.timers.set(key, timer);
    }

    private addToReadyBatch(row: PendingWrite): void {
        this.readyBatch.push(row);
        if (this.readyBatch.length >= this.maxBatchSize) {
            void this.flushReadyBatch();
        }
    }

    private async flushReadyBatch(): Promise<void> {
        if (this.readyBatch.length === 0) return;
        const rows = this.readyBatch;
        this.readyBatch = [];
        await this.flushCallback(rows);
    }

    async flushAll(): Promise<void> {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        for (const row of this.pending.values()) {
            this.readyBatch.push(row);
        }
        this.pending.clear();
        await this.flushReadyBatch();
    }

    destroy(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.pending.clear();
        this.readyBatch = [];
        if (this.flushTimer !== null) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
}
