export interface TableMappingEntry {
    stateId: string;
    table: string;
    column: string;
}

export interface AdapterConfig {
    host: string;
    port: number;
    protocol: 'http' | 'https' | 'tcp';
    username: string;
    password: string;
    dbWriteTimeout: number;
    writeOnlyAcknowledged: boolean;
    debounceMs: number;
    maxBatchSize: number;
    flushIntervalMs: number;
    reconnectIntervalMs: number;
    tableMappings: TableMappingEntry[];
    insecureTls: boolean;
}

export interface DatapointCustomConfig {
    enabled: boolean;
    alias: string;
    debounceMs: number;
}

export interface PendingWrite {
    table: string;
    stateId: string;
    val: ioBroker.StateValue;
    ts: number;
    /** When set, write in wide-table mode: use this as the column name, omit the stateId symbol tag */
    column?: string;
}
