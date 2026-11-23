import { readFile } from 'node:fs/promises';

const PROC_FILES = {
  stat: process.env.HOST_PROC_STAT || '/host-proc-stat',
  meminfo: process.env.HOST_PROC_MEMINFO || '/host-proc-meminfo',
  netDev: process.env.HOST_PROC_NET_DEV || '/host-net-dev',
};
const INVALID_NETWORK_COUNTER = Symbol('invalid-network-counter');
const GiB = 1024 ** 3;

const parseCpu = (text) => {
  const line = text.split('\n').find((row) => /^cpu\s/.test(row));
  if (!line) throw new Error('Host CPU counters are missing from /proc/stat');
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Host CPU counters in /proc/stat are invalid');
  }
  const idle = values[3] + (values[4] || 0);
  // guest/guest_nice are already included in user/nice; exclude their duplicate counters from total.
  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
  const cpuCount = text.split('\n').filter((row) => /^cpu\d+\s/.test(row)).length;
  if (cpuCount === 0) throw new Error('Per-core CPU counters are missing from /proc/stat');
  return { total, idle, cpuCount };
};

const parseMemory = (text) => {
  const values = new Map();
  for (const line of text.split('\n')) {
    const match = /^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/.exec(line.trim());
    if (match) values.set(match[1], Number(match[2]) * 1024);
  }
  const totalBytes = values.get('MemTotal');
  const availableBytes = values.get('MemAvailable');
  if (!totalBytes || availableBytes === undefined || availableBytes > totalBytes) {
    throw new Error('Host memory counters in /proc/meminfo are invalid');
  }
  return {
    totalGb: totalBytes / GiB,
    usedGb: (totalBytes - availableBytes) / GiB,
  };
};

const EXCLUDED_INTERFACE = /^(lo|veth.*|docker.*|br-.*|virbr.*|cni.*|flannel.*|cali.*|tun.*|tap.*)$/;

const parseNetwork = (text) => {
  const interfaces = new Map();
  for (const line of text.split('\n').slice(2)) {
    const split = line.indexOf(':');
    if (split < 0) continue;
    const name = line.slice(0, split).trim();
    if (!name || EXCLUDED_INTERFACE.test(name)) continue;
    const counters = line.slice(split + 1).trim().split(/\s+/).map(Number);
    if (counters.length < 9 || counters.some((value) => !Number.isFinite(value) || value < 0)) continue;
    interfaces.set(name, { rx: counters[0], tx: counters[8] });
  }
  return interfaces;
};

export const parseProcSnapshot = ({ stat, meminfo, netDev }) => ({
  cpu: parseCpu(stat),
  memory: parseMemory(meminfo),
  network: parseNetwork(netDev),
  timestamp: Date.now(),
});

export const createHostMetricsSampler = ({ files = PROC_FILES, now = Date.now } = {}) => {
  let previous = null;

  const reset = () => { previous = null; };
  const sample = async () => {
    const [stat, meminfo, netDev] = await Promise.all([
      readFile(files.stat, 'utf8'),
      readFile(files.meminfo, 'utf8'),
      readFile(files.netDev, 'utf8'),
    ]);
    const current = parseProcSnapshot({ stat, meminfo, netDev });
    current.timestamp = now();

    if (!previous) {
      previous = current;
      return { ...current.memory, cpuCount: current.cpu.cpuCount, cpuPercent: null, receiveBps: null, transmitBps: null, timestamp: current.timestamp };
    }

    const totalDelta = current.cpu.total - previous.cpu.total;
    const idleDelta = current.cpu.idle - previous.cpu.idle;
    const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
    const cpuPercent = totalDelta > 0 && idleDelta >= 0
      ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
      : null;

    let received = 0;
    let transmitted = 0;
    let comparableInterfaces = 0;
    for (const [name, currentCounters] of current.network) {
      const previousCounters = previous.network.get(name);
      if (!previousCounters) continue;
      const rxDelta = currentCounters.rx - previousCounters.rx;
      const txDelta = currentCounters.tx - previousCounters.tx;
      if (rxDelta < 0 || txDelta < 0) {
        received = INVALID_NETWORK_COUNTER;
        transmitted = INVALID_NETWORK_COUNTER;
        break; // interface reset / recreated: avoid undercounting the remaining interfaces
      }
      received += rxDelta;
      transmitted += txDelta;
      comparableInterfaces += 1;
    }

    previous = current;
    return {
      ...current.memory,
      cpuCount: current.cpu.cpuCount,
      cpuPercent,
      receiveBps: elapsedSeconds > 0 && comparableInterfaces && received !== INVALID_NETWORK_COUNTER ? (received * 8) / elapsedSeconds : null,
      transmitBps: elapsedSeconds > 0 && comparableInterfaces && transmitted !== INVALID_NETWORK_COUNTER ? (transmitted * 8) / elapsedSeconds : null,
      timestamp: current.timestamp,
    };
  };
  return Object.assign(sample, { reset });
};

export const hostMetricsSampler = createHostMetricsSampler();
