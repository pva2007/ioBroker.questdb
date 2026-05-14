import { expect } from 'chai';
import sinon from 'sinon';
import { WriteBuffer } from '../../src/lib/buffer';
import type { PendingWrite } from '../../src/lib/types';

function makeRow(stateId: string, val: number = 1, ts: number = Date.now()): PendingWrite {
    return { table: stateId, stateId, val, ts };
}

describe('WriteBuffer', () => {
    let clock: sinon.SinonFakeTimers;
    let flushCallback: sinon.SinonStub<[PendingWrite[]], Promise<void>>;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        flushCallback = sinon.stub<[PendingWrite[]], Promise<void>>().resolves();
    });

    afterEach(() => {
        clock.restore();
        sinon.restore();
    });

    it('debounceMs=0 + flushIntervalMs>0: row added to batch, flushes on interval', async () => {
        const buffer = new WriteBuffer(flushCallback, 0, 1000, 5000);
        const row = makeRow('sensor.temperature');

        buffer.enqueue(row, 0);
        expect(flushCallback.called).to.be.false;

        await clock.tickAsync(5000);
        expect(flushCallback.calledOnce).to.be.true;
        expect(flushCallback.firstCall.args[0]).to.deep.equal([row]);
        buffer.destroy();
    });

    it('debounceMs>0: per-state debounce moves row to batch, batch flushes on interval', async () => {
        const buffer = new WriteBuffer(flushCallback, 50, 1000, 5000);
        const row = makeRow('sensor.temperature');

        buffer.enqueue(row, 50);
        expect(flushCallback.called).to.be.false;

        await clock.tickAsync(50);
        expect(flushCallback.called).to.be.false; // moved to batch, not flushed yet

        await clock.tickAsync(5000);
        expect(flushCallback.calledOnce).to.be.true;
        expect(flushCallback.firstCall.args[0]).to.deep.equal([row]);
        buffer.destroy();
    });

    it('same stateId twice during debounce: only the second value is batched (last-write-wins)', async () => {
        const buffer = new WriteBuffer(flushCallback, 100, 1000, 5000);
        const row1 = makeRow('sensor.temperature', 21, 1000);
        const row2 = makeRow('sensor.temperature', 22, 2000);

        buffer.enqueue(row1, 100);
        buffer.enqueue(row2, 100);
        await clock.tickAsync(100); // debounce fires, row2 → batch
        await clock.tickAsync(5000); // global flush

        expect(flushCallback.calledOnce).to.be.true;
        const flushed = flushCallback.firstCall.args[0];
        expect(flushed).to.have.length(1);
        expect(flushed[0].val).to.equal(22);
        buffer.destroy();
    });

    it('multiple states flush together in one batch', async () => {
        const buffer = new WriteBuffer(flushCallback, 0, 1000, 5000);

        buffer.enqueue(makeRow('sensor.a', 1), 0);
        buffer.enqueue(makeRow('sensor.b', 2), 0);
        buffer.enqueue(makeRow('sensor.c', 3), 0);

        await clock.tickAsync(5000);
        expect(flushCallback.calledOnce).to.be.true;
        expect(flushCallback.firstCall.args[0]).to.have.length(3);
        buffer.destroy();
    });

    it('maxBatchSize exceeded: immediate flush triggered without waiting for interval', () => {
        const buffer = new WriteBuffer(flushCallback, 0, 2, 60000);
        buffer.enqueue(makeRow('sensor.a'), 0);
        buffer.enqueue(makeRow('sensor.b'), 0);

        expect(flushCallback.calledOnce).to.be.true;
        expect(flushCallback.firstCall.args[0]).to.have.length(2);
        buffer.destroy();
    });

    it('flushAll: drains pending debounce entries and ready batch', async () => {
        const buffer = new WriteBuffer(flushCallback, 500, 1000, 60000);
        buffer.enqueue(makeRow('sensor.a'), 500);
        buffer.enqueue(makeRow('sensor.b'), 0); // goes straight to batch

        await buffer.flushAll();

        expect(flushCallback.calledOnce).to.be.true;
        expect(flushCallback.firstCall.args[0]).to.have.length(2);

        // No further flushes after global timer
        await clock.tickAsync(60000);
        expect(flushCallback.callCount).to.equal(1);
        buffer.destroy();
    });

    it('flushAll on empty buffer: flushCallback not called', async () => {
        const buffer = new WriteBuffer(flushCallback, 100, 1000, 5000);
        await buffer.flushAll();
        expect(flushCallback.called).to.be.false;
        buffer.destroy();
    });

    it('destroy: cancels timers and global interval without flushing', async () => {
        const buffer = new WriteBuffer(flushCallback, 0, 1000, 5000);
        buffer.enqueue(makeRow('sensor.a'), 0);

        buffer.destroy();
        await clock.tickAsync(10000);

        expect(flushCallback.called).to.be.false;
    });

    it('flushIntervalMs=0: global interval disabled, only flushes on maxBatchSize or flushAll', async () => {
        const buffer = new WriteBuffer(flushCallback, 0, 1000, 0);
        buffer.enqueue(makeRow('sensor.a'), 0);

        await clock.tickAsync(60000);
        expect(flushCallback.called).to.be.false;

        await buffer.flushAll();
        expect(flushCallback.calledOnce).to.be.true;
        buffer.destroy();
    });
});
