// Reads the flood sensor over USB (browser Web Serial, 115200 baud), ported from
// flood-sensor-poc. One JSON line per message:
//   {"type":"station",...}  ground-station heartbeat, every 2 s
//   {"type":"node",...}     a flood-sensor reading (relayed over LoRa, or "source":"usb"
//                           when the flood sensor itself is plugged in for a bench test)
//   {"distanceCm":65.2} / "Distance: 60.69 cm"   a plain USB ultrasonic sensor

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const validCoords = (gps) =>
    Number.isFinite(gps.lat) && Math.abs(gps.lat) <= 90 && Number.isFinite(gps.lng) && Math.abs(gps.lng) <= 180;

export function parseNode(line, timestamp = Date.now()) {
    const data = JSON.parse(line);
    if (data?.type !== 'node' || typeof data.node !== 'string' || !/^[A-Za-z0-9]{1,8}$/.test(data.node)) throw new Error('Invalid node id.');
    if (!Number.isSafeInteger(data.seq) || data.seq < 1) throw new Error('Invalid sequence number.');
    if (data.distanceCm !== null && (typeof data.distanceCm !== 'number' || !Number.isFinite(data.distanceCm) || data.distanceCm <= 0)) {
        throw new Error('Invalid distance.');
    }
    const gps = data.gps;
    if (typeof gps?.fix !== 'boolean' || !isCount(gps.satellites) || !isCount(gps.chars)) throw new Error('Invalid GPS status.');
    if (gps.fix && !validCoords(gps)) throw new Error('Invalid GPS coordinates.');

    const source = data.source ?? 'lora';
    if (source !== 'lora' && source !== 'usb') throw new Error('Invalid source.');
    // On USB, rssi/snr are the last ACK's (null if none yet)
    const radio = (value) => (source === 'usb' ? value === null || Number.isFinite(value) : Number.isFinite(value));
    if (!radio(data.rssi) || !radio(data.snr) || !isCount(data.lost)) throw new Error('Invalid radio values.');

    let lora = null;
    if (source === 'usb') {
        const l = data.lora;
        if (typeof l?.ready !== 'boolean' || typeof l.ackOk !== 'boolean' || !isCount(l.sent) || !isCount(l.acked)) throw new Error('Invalid LoRa status.');
        lora = { ready: l.ready, sent: l.sent, acked: l.acked, ackOk: l.ackOk };
    }
    if (data.medium !== undefined && data.medium !== 'water' && data.medium !== 'air') throw new Error('Invalid medium.');

    return {
        node: data.node,
        seq: data.seq,
        distanceCm: data.distanceCm,
        rssi: data.rssi,
        snr: data.snr,
        source,
        lora,
        medium: data.medium ?? null,
        gps: { fix: gps.fix, lat: gps.fix ? gps.lat : null, lng: gps.fix ? gps.lng : null, satellites: gps.satellites, chars: gps.chars },
        timestamp,
    };
}

export function parseStation(line, timestamp = Date.now()) {
    const data = JSON.parse(line);
    if (data?.type !== 'station' || typeof data.ready !== 'boolean') throw new Error('Invalid station status.');
    if (!Number.isFinite(data.frequencyMHz) || !Number.isSafeInteger(data.sf)) throw new Error('Invalid radio settings.');
    for (const key of ['rx', 'lost', 'unknown']) if (!isCount(data[key])) throw new Error(`Invalid station ${key}.`);
    const { ready, frequencyMHz, sf, rx, lost, unknown } = data;
    return { ready, frequencyMHz, sf, rx, lost, unknown, timestamp };
}

export function parseReading(line, timestamp = Date.now()) {
    // Anchored, so boot logs and unrelated numbers never become readings
    const text = /^Distance:\s*(\d+(?:\.\d+)?)\s*cm$/i.exec(line.trim());
    const data = text ? { distanceCm: Number(text[1]) } : JSON.parse(line);
    if (!data || data.type !== undefined || typeof data.distanceCm !== 'number' || !Number.isFinite(data.distanceCm) || data.distanceCm <= 0) {
        throw new Error('Expected a positive distanceCm.');
    }
    return { distanceCm: data.distanceCm, timestamp };
}

// The ESP32 resets when the port opens and prints boot text (and a burst of
// garbage); that's expected, so it's skipped quietly.
export function isBootLine(line) {
    if (/^(ets [A-Z][a-z]{2} |rst:0x|configsip:|clk_drv:|mode:(DIO|QIO|DOUT|QOUT)|load:0x|ho \d+ tail|entry 0x)/.test(line)) return true;
    const t = line.replace(/\s/g, '');
    // eslint-disable-next-line no-control-regex
    return t.length >= 8 && (t.match(/[�\x00-\x08\x0E-\x1F]/g) || []).length / t.length > 0.5;
}

// Joins USB chunks into lines; drops runaway lines so bad input can't grow memory.
export class LineBuffer {
    buffer = '';
    dropping = false;

    push(text, onLine, onTooLong) {
        for (const char of text) {
            if (char === '\n') {
                if (!this.dropping && this.buffer.trim()) onLine(this.buffer.trim());
                this.buffer = '';
                this.dropping = false;
            } else if (!this.dropping) {
                this.buffer += char;
                if (this.buffer.length > 4096) {
                    this.buffer = '';
                    this.dropping = true;
                    onTooLong();
                }
            }
        }
    }
}

// USB-to-serial chips found on ESP32 boards: Espressif native USB, Silicon Labs
// CP210x, WCH CH340/CH9102, FTDI
const ESP32_USB_VENDORS = [0x303a, 0x10c4, 0x1a86, 0x0403];

// Bluetooth serial ports (Windows lists one per paired device) have no USB vendor id
const isUsbPort = (port) => port.getInfo?.().usbVendorId !== undefined;

// Of the USB ports this site may already open, the ESP32 one (or the only one there is)
export function pickEsp32Port(ports) {
    const usb = ports.filter(isUsbPort);
    return usb.find((p) => ESP32_USB_VENDORS.includes(p.getInfo().usbVendorId)) ?? (usb.length === 1 ? usb[0] : null);
}

function openFailedMessage(port) {
    if (!isUsbPort(port)) {
        return 'That’s a Bluetooth port, not the sensor. Plug the ESP32 in with a data USB cable, then pick the port that isn’t Bluetooth.';
    }
    return 'Couldn’t open the port. Close Arduino Serial Monitor, other tabs of this page, or any other app using it, then try again.';
}

export const serialSupported =() => Boolean(globalThis.navigator?.serial) && Boolean(globalThis.isSecureContext);

export class SerialSensor {
    constructor({ onNode, onStation, onReading, onStatus, onProblem }) {
        Object.assign(this, { onNode, onStation, onReading, onStatus, onProblem });
        this.port = null;
        this.reader = null;
        this.stopping = false;
    }

    // Asks the user to pick a port (browsers only allow this from a click)
    async connect() {
        if (this.port || this.opening) return;
        if (!globalThis.navigator?.serial) throw new Error('This browser can’t read USB devices. Use Chrome or Edge on a computer.');
        let port;
        try {
            port = await navigator.serial.requestPort();
        } catch (error) {
            if (error.name === 'NotFoundError') return; // picker cancelled
            throw error;
        }
        await this.open(port);
    }

    // Opens an ESP32 the user already allowed on this site, without a picker.
    // Resolves to false when none is plugged in.
    async autoConnect() {
        if (this.port || this.opening || !globalThis.navigator?.serial) return false;
        const port = pickEsp32Port(await navigator.serial.getPorts());
        if (!port) return false;
        await this.open(port);
        return true;
    }

    async open(port) {
        this.opening = true;
        this.stopping = false;
        this.onStatus('connecting');
        try {
            await port.open({ baudRate: 115200 });
        } catch (error) {
            this.onStatus('disconnected');
            throw new Error(openFailedMessage(port), { cause: error });
        } finally {
            this.opening = false;
        }
        // Disconnect was asked for while the port was opening
        if (this.stopping) {
            await port.close().catch(() => {});
            this.onStatus('disconnected');
            return;
        }
        this.port = port;
        this.onStatus('connected');
        this.readTask = this.read();
    }

    handleLine(line) {
        if (isBootLine(line)) return;
        if (/Brownout detector was triggered/i.test(line)) {
            this.onProblem('The board restarted from low power. Try another USB cable or port.');
            return;
        }
        let type;
        if (line.startsWith('{')) {
            try {
                type = JSON.parse(line)?.type;
            } catch {
                // not JSON; tried as a plain reading below
            }
        }
        try {
            if (type === 'node') this.onNode(parseNode(line));
            else if (type === 'station') this.onStation(parseStation(line));
            else this.onReading(parseReading(line));
        } catch {
            this.onProblem('Got data the page can’t read. Check that the board runs the latest firmware at 115200 baud.');
        }
    }

    async read() {
        const decoder = new TextDecoder();
        const lines = new LineBuffer();
        try {
            this.reader = this.port.readable.getReader();
            while (!this.stopping) {
                const { value, done } = await this.reader.read();
                if (done) break;
                lines.push(
                    decoder.decode(value, { stream: true }),
                    (line) => this.handleLine(line),
                    () => this.onProblem('Got a line that was too long; skipped it.'),
                );
            }
        } catch {
            // unplugged mid-read; reported below
        } finally {
            const lost = !this.stopping;
            this.reader?.releaseLock();
            this.reader = null;
            try {
                await this.port?.close();
            } catch {
                // USB may already be unplugged
            }
            this.port = null;
            this.onStatus('disconnected');
            if (lost) this.onProblem('Lost the USB connection. Check the cable and connect again.');
        }
    }

    async disconnect() {
        this.stopping = true;
        await this.reader?.cancel().catch(() => {});
        await this.readTask;
    }
}
