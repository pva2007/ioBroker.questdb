import { expect } from 'chai';
import { sanitizeId, getCustomConfigFromObj } from '../../src/lib/utils';

describe('sanitizeId', () => {
    it('replaces dots with underscores', () => {
        expect(sanitizeId('system.adapter.test.0')).to.equal('system_adapter_test_0');
    });

    it('strips characters that are not alphanumeric or underscore', () => {
        expect(sanitizeId('sensor/temperature-celsius')).to.equal('sensortemperaturecelsius');
    });

    it('preserves existing underscores', () => {
        expect(sanitizeId('my_adapter.0.some_state')).to.equal('my_adapter_0_some_state');
    });

    it('handles already-clean identifiers unchanged', () => {
        expect(sanitizeId('sensor_temp')).to.equal('sensor_temp');
    });
});

describe('getCustomConfigFromObj', () => {
    const NS = 'questdb.0';

    it('returns null for null object', () => {
        expect(getCustomConfigFromObj(null, NS)).to.be.null;
    });

    it('returns null for non-state object', () => {
        const obj = { type: 'channel', common: {}, native: {} } as unknown as ioBroker.Object;
        expect(getCustomConfigFromObj(obj, NS)).to.be.null;
    });

    it('returns null when custom config is absent', () => {
        const obj = {
            type: 'state',
            common: { name: 'test', role: 'state', type: 'number', read: true, write: true },
            native: {},
        } as ioBroker.StateObject;
        expect(getCustomConfigFromObj(obj, NS)).to.be.null;
    });

    it('returns null when enabled is false', () => {
        const obj = {
            type: 'state',
            common: {
                name: 'test',
                role: 'state',
                type: 'number',
                read: true,
                write: true,
                custom: { [NS]: { enabled: false } },
            },
            native: {},
        } as unknown as ioBroker.StateObject;
        expect(getCustomConfigFromObj(obj, NS)).to.be.null;
    });

    it('returns config with defaults when enabled=true and no alias/debounce', () => {
        const obj = {
            type: 'state',
            common: {
                name: 'test',
                role: 'state',
                type: 'number',
                read: true,
                write: true,
                custom: { [NS]: { enabled: true } },
            },
            native: {},
        } as unknown as ioBroker.StateObject;
        const result = getCustomConfigFromObj(obj, NS);
        expect(result).to.deep.equal({ enabled: true, alias: '', debounceMs: -1 });
    });

    it('returns config with alias and debounce when set', () => {
        const obj = {
            type: 'state',
            common: {
                name: 'test',
                role: 'state',
                type: 'number',
                read: true,
                write: true,
                custom: { [NS]: { enabled: true, alias: 'my_table', debounceMs: 500 } },
            },
            native: {},
        } as unknown as ioBroker.StateObject;
        const result = getCustomConfigFromObj(obj, NS);
        expect(result).to.deep.equal({ enabled: true, alias: 'my_table', debounceMs: 500 });
    });
});
