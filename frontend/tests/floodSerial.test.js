import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNode, parseReading, parseStation, LineBuffer, isBootLine } from '../src/utils/floodSerial.js';

test('parses the plain USB sensor formats only', () => {
    assert.deepEqual(parseReading('{"distanceCm":42.3}', 1), { distanceCm: 42.3, timestamp: 1 });
    assert.equal(parseReading(' Distance: 60.69 cm\r ').distanceCm, 60.69);
    for (const line of ['boot', '{}', '{"distanceCm":0}', '{"distanceCm":"4"}', 'Distance: 6 mm', 'debug Distance: 6 cm']) {
        assert.throws(() => parseReading(line));
    }
});

test('parses ground-station node packets, including no echo and no fix', () => {
    const packet = { type: 'node', node: 'FS01', seq: 12, distanceCm: 54.3, gps: { fix: true, lat: 14.6, lng: 121.0, satellites: 7, chars: 4800 }, rssi: -62, snr: 9.5, lost: 0 };
    const parsed = parseNode(JSON.stringify(packet), 5);
    assert.equal(parsed.source, 'lora');
    assert.equal(parsed.gps.lat, 14.6);
    const blank = { ...packet, distanceCm: null, gps: { fix: false, lat: null, lng: null, satellites: 0, chars: 0 } };
    assert.equal(parseNode(JSON.stringify(blank)).distanceCm, null);
    for (const bad of [{ ...packet, node: 'FS-01' }, { ...packet, seq: 0 }, { ...packet, gps: { ...packet.gps, lat: 91 } }, { ...packet, rssi: null }]) {
        assert.throws(() => parseNode(JSON.stringify(bad)));
    }
    assert.throws(() => parseReading(JSON.stringify(packet)));
});

test('parses the flood sensor plugged in directly over USB', () => {
    const packet = { type: 'node', node: 'FS01', seq: 1, distanceCm: 80, source: 'usb', rssi: null, snr: null, lost: 0,
        gps: { fix: false, lat: null, lng: null, satellites: 0, chars: 10 }, lora: { ready: true, sent: 2, acked: 0, ackOk: false, stationRssi: null } };
    assert.equal(parseNode(JSON.stringify(packet)).lora.sent, 2);
});

test('parses the ground-station heartbeat', () => {
    const beat = { type: 'station', ready: true, frequencyMHz: 433, sf: 9, bandwidthKHz: 125, rx: 12, lost: 1, acks: 12, unknown: 0, lastUnknown: '', uptimeS: 130 };
    assert.equal(parseStation(JSON.stringify(beat), 7).rx, 12);
    assert.throws(() => parseStation(JSON.stringify({ ...beat, rx: -1 })));
});

test('joins split USB chunks and recovers from an oversized line', () => {
    const buffer = new LineBuffer();
    const lines = [];
    let tooLong = 0;
    const push = (text) => buffer.push(text, (l) => lines.push(l), () => tooLong++);
    push('{"distance');
    push('Cm":42}\r\n\n{"distanceCm":43}\n');
    push('x'.repeat(5000));
    push('\n{"distanceCm":44}\n');
    assert.deepEqual(lines, ['{"distanceCm":42}', '{"distanceCm":43}', '{"distanceCm":44}']);
    assert.equal(tooLong, 1);
});

test('skips ESP32 boot text', () => {
    assert.ok(isBootLine('rst:0x1 (POWERON_RESET),boot:0x13'));
    assert.ok(!isBootLine('{"distanceCm":42}'));
});

test('picks the ESP32 among allowed ports, or the only port there is', async () => {
    const { pickEsp32Port } = await import('../src/utils/floodSerial.js');
    const port = (usbVendorId) => ({ getInfo: () => ({ usbVendorId }) });
    const cp210x = port(0x10c4);
    assert.equal(pickEsp32Port([port(0x046d), cp210x]), cp210x);
    const only = port(0x046d);
    assert.equal(pickEsp32Port([only]), only);
    assert.equal(pickEsp32Port([port(0x046d), port(0x05ac)]), null);
    assert.equal(pickEsp32Port([]), null);
    const bluetooth = { getInfo: () => ({ bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' }) };
    assert.equal(pickEsp32Port([bluetooth]), null);
    assert.equal(pickEsp32Port([bluetooth, only]), only);
});

test('says when the picked port is Bluetooth rather than the sensor', async () => {
    const { SerialSensor } = await import('../src/utils/floodSerial.js');
    const port = { open: async () => { throw new DOMException('Failed to open serial port.', 'NetworkError'); }, getInfo: () => ({}) };
    const sensor = new SerialSensor({ onStatus: () => {} });
    await assert.rejects(sensor.open(port), /Bluetooth port, not the sensor/);
});

test('autoConnect opens an allowed ESP32 without the picker', async () => {
    const { SerialSensor } = await import('../src/utils/floodSerial.js');
    let finish;
    const statuses = [];
    const reader = { read: () => new Promise((resolve) => { finish = resolve; }), cancel: async () => finish({ done: true }), releaseLock: () => {} };
    const port = { open: async () => {}, close: async () => {}, readable: { getReader: () => reader }, getInfo: () => ({ usbVendorId: 0x1a86 }) };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { serial: { getPorts: async () => [port], requestPort: async () => assert.fail('picker opened') } },
    });
    try {
        const sensor = new SerialSensor({ onStatus: (s) => statuses.push(s), onProblem: (m) => assert.fail(m) });
        assert.equal(await sensor.autoConnect(), true);
        assert.equal(sensor.port, port);
        await sensor.disconnect();
        assert.deepEqual(statuses, ['connecting', 'connected', 'disconnected']);
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});
