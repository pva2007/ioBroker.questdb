import * as utils from '@iobroker/adapter-core';
import { QuestDbClient } from './lib/questdb-client';
import { WriteBuffer } from './lib/buffer';
import { ObjectCache } from './lib/object-cache';
import { sanitizeId, getCustomConfigFromObj } from './lib/utils';
import type { AdapterConfig, PendingWrite, TableMappingEntry } from './lib/types';

export { sanitizeId, getCustomConfigFromObj };

class QuestdbAdapter extends utils.Adapter {
    private client: QuestDbClient | null = null;
    private buffer: WriteBuffer | null = null;
    private readonly objectCache = new ObjectCache();
    private readonly tableMappingMap = new Map<string, { table: string; column: string }>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isUnloading = false;

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'questdb' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private get cfg(): AdapterConfig {
        return this.config as unknown as AdapterConfig;
    }

    private async onReady(): Promise<void> {
        try {
            this.buildTableMappingMap();
            await this.setState('info.connection', false, true);
            await this.loadEnabledObjects();
            await this.subscribeForeignObjectsAsync('*');
            this.initBuffer();
            await this.connectToQuestDb();
        } catch (err) {
            this.log.error(`Fatal error during startup: ${err}`);
            this.terminate(1);
        }
    }

    private initBuffer(): void {
        const cfg = this.cfg;
        this.buffer?.destroy();
        this.buffer = new WriteBuffer(
            (rows) => this.flushRows(rows),
            cfg.debounceMs,
            cfg.maxBatchSize,
            cfg.flushIntervalMs ?? 5000,
        );
    }

    private buildTableMappingMap(): void {
        this.tableMappingMap.clear();
        for (const entry of (this.cfg.tableMappings ?? []) as TableMappingEntry[]) {
            if (entry.stateId && entry.table && entry.column) {
                this.tableMappingMap.set(entry.stateId, { table: entry.table, column: entry.column });
            }
        }
        if (this.tableMappingMap.size > 0) {
            this.log.info(`Wide-table mapping active: ${this.tableMappingMap.size} state(s) mapped`);
        }
    }

    private async loadEnabledObjects(): Promise<void> {
        const objects = await this.getForeignObjectsAsync('*', 'state');
        for (const [id, obj] of Object.entries(objects)) {
            const custom = getCustomConfigFromObj(obj, this.namespace);
            if (custom !== null) {
                this.objectCache.set(id, custom);
                await this.subscribeForeignStatesAsync(id);
            }
        }
        // Subscribe to wide-table mapped states not already covered by per-datapoint config
        for (const stateId of this.tableMappingMap.keys()) {
            if (this.objectCache.get(stateId) === undefined) {
                await this.subscribeForeignStatesAsync(stateId);
            }
        }
    }

    private async connectToQuestDb(): Promise<void> {
        if (this.isUnloading) return;
        this.client = new QuestDbClient(this.cfg);
        try {
            await this.client.connect();
            await this.setState('info.connection', true, true);
            this.log.info('Connected to QuestDB');
        } catch (err) {
            await this.setState('info.connection', false, true);
            this.log.error(`Failed to connect to QuestDB: ${err}`);
            this.scheduleReconnect();
        }
    }

    private async flushRows(rows: PendingWrite[]): Promise<void> {
        if (!this.client?.isConnected()) return;
        try {
            for (const row of rows) {
                await this.client.write(row);
            }
            await this.client.flush();
        } catch (err) {
            this.log.error(`Write error: ${err}`);
            this.client = null;
            void this.setState('info.connection', false, true);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.isUnloading || this.reconnectTimer !== null) return;
        const interval = this.cfg.reconnectIntervalMs;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connectToQuestDb();
        }, interval);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state) return;
        const cfg = this.cfg;
        if (cfg.writeOnlyAcknowledged && !state.ack) return;
        if (state.val === null || state.val === undefined) return;

        const wideMapping = this.tableMappingMap.get(id);
        if (wideMapping) {
            const row: PendingWrite = {
                table: wideMapping.table,
                stateId: id,
                val: state.val,
                ts: state.ts,
                column: wideMapping.column,
            };
            this.buffer?.enqueue(row, cfg.debounceMs);
            return;
        }

        const custom = this.objectCache.get(id);
        if (!custom) return;

        const debounce = custom.debounceMs >= 0 ? custom.debounceMs : cfg.debounceMs;
        const table = custom.alias || sanitizeId(id);
        const row: PendingWrite = {
            table,
            stateId: id,
            val: state.val,
            ts: state.ts,
        };
        this.buffer?.enqueue(row, debounce);
    }

    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        const existing = this.objectCache.get(id);
        const custom = getCustomConfigFromObj(obj, this.namespace);

        if (custom !== null) {
            this.objectCache.set(id, custom);
            if (existing === undefined) {
                await this.subscribeForeignStatesAsync(id);
            }
        } else if (existing !== undefined) {
            this.objectCache.delete(id);
            await this.unsubscribeForeignStatesAsync(id);
        }
    }

    private onMessage(obj: ioBroker.Message): void {
        if (!obj || obj.command !== 'testConnection') return;
        const config: AdapterConfig =
            obj.message && typeof obj.message === 'object' ? (obj.message as AdapterConfig) : this.cfg;
        QuestDbClient.testConnection(config)
            .then(() => {
                this.sendTo(
                    obj.from,
                    obj.command,
                    { result: 'Connection successful' },
                    obj.callback,
                );
            })
            .catch((err: Error) => {
                this.sendTo(
                    obj.from,
                    obj.command,
                    { error: `Connection failed: ${err.message}` },
                    obj.callback,
                );
            });
    }

    private async onUnload(callback: () => void): Promise<void> {
        this.isUnloading = true;
        this.clearReconnectTimer();
        try {
            await this.setState('info.connection', false, true);
            if (this.buffer) {
                await this.buffer.flushAll();
                this.buffer.destroy();
            }
            if (this.client) await this.client.close();
        } catch (err) {
            this.log.error(`Error during unload: ${err}`);
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions>): QuestdbAdapter =>
        new QuestdbAdapter(options);
} else {
    new QuestdbAdapter();
}
