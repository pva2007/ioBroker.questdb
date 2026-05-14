import { expect } from 'chai';
import sinon from 'sinon';
import { QuestDbClient } from '../../src/lib/questdb-client';
import type { AdapterConfig, PendingWrite } from '../../src/lib/types';

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
    return {
        host: 'localhost',
        port: 9000,
        protocol: 'http',
        username: 'admin',
        password: 'secret',
        dbWriteTimeout: 10000,
        writeOnlyAcknowledged: true,
        debounceMs: 0,
        maxBatchSize: 1000,
        flushIntervalMs: 5000,
        reconnectIntervalMs: 30000,
        tableMappings: [],
        insecureTls: false,
        ...overrides,
    };
}

function makeMockSender() {
    const stub = {
        table: sinon.stub().returnsThis(),
        symbol: sinon.stub().returnsThis(),
        floatColumn: sinon.stub().returnsThis(),
        booleanColumn: sinon.stub().returnsThis(),
        stringColumn: sinon.stub().returnsThis(),
        at: sinon.stub().resolves(),
        atNow: sinon.stub().resolves(),
        flush: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
    };
    return stub;
}

function makeRow(val: ioBroker.StateValue, stateId = 'sensor.temperature'): PendingWrite {
    return { table: 'sensor_temperature', stateId, val, ts: 1000 };
}

function makeWideRow(val: ioBroker.StateValue, column: string, stateId = 'zigbee.0.sensor.temp'): PendingWrite {
    return { table: 'iot_weather', stateId, column, val, ts: 1000 };
}

describe('QuestDbClient', () => {
    afterEach(() => sinon.restore());

    describe('buildConfigString', () => {
        it('HTTP: produces correct config string with credentials and timeout', () => {
            const client = new QuestDbClient(makeConfig());
            const cfg = client.buildConfigString();
            expect(cfg).to.equal(
                'http::addr=localhost:9000;username=admin;password=secret;request_timeout=10000;',
            );
        });

        it('HTTP: omits username/password when empty', () => {
            const client = new QuestDbClient(makeConfig({ username: '', password: '' }));
            const cfg = client.buildConfigString();
            expect(cfg).to.equal('http::addr=localhost:9000;request_timeout=10000;');
        });

        it('TCP: produces correct config string without credentials', () => {
            const client = new QuestDbClient(makeConfig({ protocol: 'tcp', port: 9009 }));
            const cfg = client.buildConfigString();
            expect(cfg).to.equal('tcp::addr=localhost:9009;');
        });

        it('HTTPS: produces correct config string with https scheme', () => {
            const client = new QuestDbClient(makeConfig({ protocol: 'https', port: 443 }));
            const cfg = client.buildConfigString();
            expect(cfg).to.equal(
                'https::addr=localhost:443;username=admin;password=secret;request_timeout=10000;',
            );
        });

        it('HTTPS with insecureTls: appends tls_verify=unsafe_off', () => {
            const client = new QuestDbClient(
                makeConfig({ protocol: 'https', port: 443, insecureTls: true }),
            );
            const cfg = client.buildConfigString();
            expect(cfg).to.equal(
                'https::addr=localhost:443;username=admin;password=secret;request_timeout=10000;tls_verify=unsafe_off;',
            );
        });

        it('HTTP with insecureTls: tls_verify is NOT added (only applies to https)', () => {
            const client = new QuestDbClient(makeConfig({ insecureTls: true }));
            const cfg = client.buildConfigString();
            expect(cfg).to.not.include('tls_verify');
        });
    });

    describe('write', () => {
        let mockSender: ReturnType<typeof makeMockSender>;
        let client: QuestDbClient;

        beforeEach(async () => {
            mockSender = makeMockSender();
            client = new QuestDbClient(makeConfig(), async () => mockSender as never);
            await client.connect();
        });

        it('number value: calls floatColumn', async () => {
            await client.write(makeRow(22.5));
            expect(mockSender.floatColumn.calledWith('value', 22.5)).to.be.true;
            expect(mockSender.at.calledOnce).to.be.true;
        });

        it('boolean value: calls booleanColumn', async () => {
            await client.write(makeRow(true));
            expect(mockSender.booleanColumn.calledWith('value', true)).to.be.true;
            expect(mockSender.at.calledOnce).to.be.true;
        });

        it('string value: calls stringColumn', async () => {
            await client.write(makeRow('on'));
            expect(mockSender.stringColumn.calledWith('value', 'on')).to.be.true;
            expect(mockSender.at.calledOnce).to.be.true;
        });

        it('null value: no column methods called', async () => {
            await client.write(makeRow(null));
            expect(mockSender.floatColumn.called).to.be.false;
            expect(mockSender.booleanColumn.called).to.be.false;
            expect(mockSender.stringColumn.called).to.be.false;
            expect(mockSender.at.called).to.be.false;
        });

        it('symbol called with stateId tag', async () => {
            await client.write(makeRow(42, 'zigbee.0.temp'));
            expect(mockSender.symbol.calledWith('stateId', 'zigbee.0.temp')).to.be.true;
        });

        it('at called with the row timestamp in ms', async () => {
            const row = makeRow(1, 'sensor.a');
            row.ts = 1746528000000;
            await client.write(row);
            expect(mockSender.at.calledWith(1746528000000, 'ms')).to.be.true;
        });
    });

    describe('write (wide-table mode)', () => {
        let mockSender: ReturnType<typeof makeMockSender>;
        let client: QuestDbClient;

        beforeEach(async () => {
            mockSender = makeMockSender();
            client = new QuestDbClient(makeConfig(), async () => mockSender as never);
            await client.connect();
        });

        it('number value: floatColumn called with mapped column name', async () => {
            await client.write(makeWideRow(22.5, 'outdoor_temp_c'));
            expect(mockSender.floatColumn.calledWith('outdoor_temp_c', 22.5)).to.be.true;
            expect(mockSender.at.calledOnce).to.be.true;
        });

        it('boolean value: booleanColumn called with mapped column name', async () => {
            await client.write(makeWideRow(true, 'motion_detected'));
            expect(mockSender.booleanColumn.calledWith('motion_detected', true)).to.be.true;
        });

        it('string value: stringColumn called with mapped column name', async () => {
            await client.write(makeWideRow('clear', 'sky_condition'));
            expect(mockSender.stringColumn.calledWith('sky_condition', 'clear')).to.be.true;
        });

        it('null value: no column methods called', async () => {
            await client.write(makeWideRow(null, 'outdoor_temp_c'));
            expect(mockSender.floatColumn.called).to.be.false;
            expect(mockSender.at.called).to.be.false;
        });

        it('symbol NOT called — no stateId tag in wide-table mode', async () => {
            await client.write(makeWideRow(10, 'wind_speed_kmh'));
            expect(mockSender.symbol.called).to.be.false;
        });

        it('auto-table mode still writes stateId symbol when column is absent', async () => {
            await client.write(makeRow(42, 'zigbee.0.temp'));
            expect(mockSender.symbol.calledWith('stateId', 'zigbee.0.temp')).to.be.true;
        });
    });

    describe('flush', () => {
        it('delegates to sender.flush()', async () => {
            const mockSender = makeMockSender();
            const client = new QuestDbClient(makeConfig(), async () => mockSender as never);
            await client.connect();
            await client.flush();
            expect(mockSender.flush.calledOnce).to.be.true;
        });
    });

    describe('close', () => {
        it('delegates to sender.close() and marks as disconnected', async () => {
            const mockSender = makeMockSender();
            const client = new QuestDbClient(makeConfig(), async () => mockSender as never);
            await client.connect();
            expect(client.isConnected()).to.be.true;
            await client.close();
            expect(mockSender.close.calledOnce).to.be.true;
            expect(client.isConnected()).to.be.false;
        });
    });

    describe('testConnection', () => {
        it('resolves when factory succeeds', async () => {
            const mockSender = makeMockSender();
            await QuestDbClient.testConnection(makeConfig(), async () => mockSender as never);
            expect(mockSender.close.calledOnce).to.be.true;
        });

        it('rejects when factory throws', async () => {
            const factory = sinon.stub().rejects(new Error('connection refused'));
            let thrown: Error | null = null;
            try {
                await QuestDbClient.testConnection(makeConfig(), factory);
            } catch (err) {
                thrown = err as Error;
            }
            expect(thrown).to.not.be.null;
            expect(thrown!.message).to.equal('connection refused');
        });
    });
});
