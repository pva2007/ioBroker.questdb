import { Sender } from '@questdb/nodejs-client';
import type { AdapterConfig, PendingWrite } from './types';

export type SenderFactory = (configString: string) => Promise<Sender>;

const defaultSenderFactory: SenderFactory = (cfg) => Sender.fromConfig(cfg);

export class QuestDbClient {
    private sender: Sender | null = null;
    private connected = false;

    constructor(
        private readonly config: AdapterConfig,
        private readonly senderFactory: SenderFactory = defaultSenderFactory,
    ) {}

    buildConfigString(): string {
        const { protocol, host, port, username, password, dbWriteTimeout, insecureTls } = this.config;
        if (protocol === 'tcp') {
            return `tcp::addr=${host}:${port};`;
        }
        const scheme = protocol === 'https' ? 'https' : 'http';
        let cfg = `${scheme}::addr=${host}:${port};`;
        if (username) cfg += `username=${username};`;
        if (password) cfg += `password=${password};`;
        cfg += `request_timeout=${dbWriteTimeout};`;
        if (protocol === 'https' && insecureTls) {
            cfg += 'tls_verify=unsafe_off;';
        }
        return cfg;
    }

    async connect(): Promise<void> {
        this.sender = await this.senderFactory(this.buildConfigString());
        this.connected = true;
    }

    async write(row: PendingWrite): Promise<void> {
        if (!this.sender) throw new Error('Not connected to QuestDB');
        const { val, table, ts } = row;
        if (val === null || val === undefined) return;

        const isWide = row.column !== undefined;
        const chain = isWide
            ? this.sender.table(table)
            : this.sender.table(table).symbol('stateId', row.stateId);
        const col = row.column ?? 'value';

        if (typeof val === 'number') {
            await chain.floatColumn(col, val).at(ts, 'ms');
        } else if (typeof val === 'boolean') {
            await chain.booleanColumn(col, val).at(ts, 'ms');
        } else {
            await chain.stringColumn(col, String(val)).at(ts, 'ms');
        }
    }

    async flush(): Promise<void> {
        await this.sender?.flush();
    }

    async close(): Promise<void> {
        if (this.sender) {
            await this.sender.close();
            this.sender = null;
        }
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected && this.sender !== null;
    }

    static async testConnection(config: AdapterConfig, senderFactory?: SenderFactory): Promise<void> {
        const client = new QuestDbClient(config, senderFactory);
        await client.connect();
        await client.close();
    }
}
