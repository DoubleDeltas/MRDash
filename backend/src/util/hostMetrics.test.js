import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostMetricsSampler, parseProcSnapshot } from './hostMetrics.js';

const proc = ({ cpu, memTotal = 8 * 1024 * 1024, memAvailable = 3 * 1024 * 1024, ethRx, ethTx, tunRx = 0, tunTx = 0 }) => ({
  stat: `cpu ${cpu.join(' ')}\ncpu0 ${cpu.join(' ')}\ncpu1 ${cpu.join(' ')}\n`,
  meminfo: `MemTotal: ${memTotal} kB\nMemAvailable: ${memAvailable} kB\n`,
  netDev: [
    'Inter-| Receive | Transmit',
    ' face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed',
    `  eth0: ${ethRx} 0 0 0 0 0 0 0 ${ethTx} 0 0 0 0 0 0 0`,
    `  lo: 999999 0 0 0 0 0 0 0 999999 0 0 0 0 0 0 0`,
    `  tun0: ${tunRx} 0 0 0 0 0 0 0 ${tunTx} 0 0 0 0 0 0 0`,
  ].join('\n'),
});

test('parses host memory and excludes loopback and tunnel interfaces', () => {
  const snapshot = parseProcSnapshot(proc({ cpu: [10, 0, 5, 85, 0, 0, 0, 0], ethRx: 100, ethTx: 200, tunRx: 500, tunTx: 700 }));
  assert.equal(snapshot.memory.totalGb, 8 * 1024 * 1024 * 1024 / 1024 ** 3);
  assert.equal(snapshot.memory.usedGb, 5 * 1024 * 1024 * 1024 / 1024 ** 3);
  assert.deepEqual([...snapshot.network.keys()], ['eth0']);
  assert.equal(snapshot.cpu.cpuCount, 2);
});

test('samples CPU busy percentage and network bits per second from counter deltas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mrd-host-proc-'));
  await mkdir(join(root, 'net'));
  let timestamp = 1_000;
  let data = proc({ cpu: [10, 0, 10, 80, 0, 0, 0, 0], ethRx: 1000, ethTx: 2000 });
  const write = async () => Promise.all([
    writeFile(join(root, 'stat'), data.stat),
    writeFile(join(root, 'meminfo'), data.meminfo),
    writeFile(join(root, 'net', 'dev'), data.netDev),
  ]);
  await write();
  const sample = createHostMetricsSampler({ files: { stat: join(root, 'stat'), meminfo: join(root, 'meminfo'), netDev: join(root, 'net', 'dev') }, now: () => timestamp });
  try {
    const first = await sample();
    assert.equal(first.cpuPercent, null);
    assert.equal(first.receiveBps, null);

    timestamp += 1000;
    data = proc({ cpu: [20, 0, 20, 100, 0, 0, 0, 0], ethRx: 2000, ethTx: 4000, tunRx: 5000, tunTx: 9000 });
    await write();
    const second = await sample();
    assert.equal(second.cpuPercent, 50);
    assert.equal(second.receiveBps, 8000);
    assert.equal(second.transmitBps, 16000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('counter resets do not produce negative network rates and malformed proc data is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mrd-host-proc-'));
  await mkdir(join(root, 'net'));
  let timestamp = 1_000;
  let data = proc({ cpu: [10, 0, 10, 80, 0, 0, 0, 0], ethRx: 1000, ethTx: 2000 });
  const write = async () => Promise.all([
    writeFile(join(root, 'stat'), data.stat),
    writeFile(join(root, 'meminfo'), data.meminfo),
    writeFile(join(root, 'net', 'dev'), data.netDev),
  ]);
  await write();
  const sample = createHostMetricsSampler({ files: { stat: join(root, 'stat'), meminfo: join(root, 'meminfo'), netDev: join(root, 'net', 'dev') }, now: () => timestamp });
  try {
    await sample();
    timestamp += 1000;
    data = proc({ cpu: [9, 0, 11, 80, 0, 0, 0, 0], ethRx: 2, ethTx: 3 });
    await write();
    const reset = await sample();
    assert.equal(reset.receiveBps, null);
    assert.equal(reset.transmitBps, null);
    await writeFile(join(root, 'meminfo'), 'invalid\n');
    await assert.rejects(sample(), /meminfo/);
    sample.reset();
    timestamp += 1000;
    await writeFile(join(root, 'meminfo'), data.meminfo);
    const restarted = await sample();
    assert.equal(restarted.cpuPercent, null);
    assert.equal(restarted.receiveBps, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
