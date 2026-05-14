// Augments the globally declared ioBroker.AdapterConfig type with this adapter's native config fields.

declare global {
    namespace ioBroker {
        interface AdapterConfig {
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
            tableMappings: Array<{ stateId: string; table: string; column: string }>;
            insecureTls: boolean;
        }
    }
}

export {};
