import { useCallback, useEffect, useRef, useState } from 'react';
import { SerialSensor } from '../utils/floodSerial';
import { DEFAULT_SETTINGS, toAirCalibrated } from '../utils/floodSensor';
import { shouldSave, toFloodRecord } from '../utils/floodRecord';
import { API_BASE_URL } from '../config';

// Readings kept in memory for the chart (the sensor sends one every ~10 s)
const MAX_READINGS = 120;
const SETTINGS_KEY = 'drony.floodSensorSettings';

function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

// Live flood sensor over USB. `readings` holds every packet, including no-echo ones
// (distanceCm null); distances are air-calibrated (see utils/floodSensor.js).
// Each reading is also posted to /api/flood/readings to keep it in the database;
// `storage` says how many were saved this session and the last save error, if any.
export default function useFloodSensor() {
    const [status, setStatus] = useState('disconnected');
    const [connectedAt, setConnectedAt] = useState(null);
    const [station, setStation] = useState(null);
    const [readings, setReadings] = useState([]);
    const [problem, setProblem] = useState('');
    const [settings, setSettingsState] = useState(loadSettings);
    const [storage, setStorage] = useState({ saved: 0, error: '' });
    const sensor = useRef(null);
    const paused = useRef(false);
    // Read from inside the sensor callbacks, which are set up once
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const lastSerialSaved = useRef(null);

    useEffect(() => {
        const save = async (item) => {
            if (!shouldSave(item, lastSerialSaved.current)) return;
            if (item.source === 'serial') lastSerialSaved.current = item.timestamp;
            try {
                const res = await fetch(`${API_BASE_URL}/api/flood/readings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(toFloodRecord(item, settingsRef.current)),
                });
                const body = await res.json();
                if (!body.success) throw new Error(body.error);
                setStorage((s) => ({ saved: s.saved + 1, error: '' }));
            } catch (error) {
                setStorage((s) => ({ ...s, error: `Not saved to the database: ${error.message}` }));
            }
        };
        const add = (item) => {
            setReadings((prev) => [...prev.slice(-(MAX_READINGS - 1)), item]);
            save(item);
        };
        sensor.current = new SerialSensor({
            onNode: (packet) => add(toAirCalibrated(packet)),
            onStation: setStation,
            onReading: (reading) => add({ ...reading, source: 'serial' }),
            onStatus: (next) => {
                setStatus(next);
                if (next === 'connected') setConnectedAt(Date.now());
            },
            onProblem: setProblem,
        });
        // Connect by itself to an ESP32 this site was already allowed to use: now, and
        // whenever one is plugged in. The first time, the browser needs Connect to be
        // clicked so the user can pick the port.
        const serial = globalThis.navigator?.serial;
        const tryAuto = async () => {
            if (paused.current) return;
            try {
                if (await sensor.current.autoConnect()) {
                    setReadings([]);
                    setStation(null);
                    setProblem('');
                }
            } catch (error) {
                setProblem(error.message);
            }
        };
        // Plugging a board back in undoes a manual Disconnect
        const onPlugIn = () => {
            paused.current = false;
            tryAuto();
        };
        // Deferred so a mount that's immediately undone (React dev mode) never opens the port
        const first = setTimeout(tryAuto, 0);
        serial?.addEventListener('connect', onPlugIn);
        return () => {
            clearTimeout(first);
            serial?.removeEventListener('connect', onPlugIn);
            sensor.current.disconnect();
        };
    }, []);

    const connect = useCallback(async () => {
        paused.current = false;
        setProblem('');
        setReadings([]);
        setStation(null);
        try {
            await sensor.current.connect();
        } catch (error) {
            setProblem(error.message);
        }
    }, []);

    // Stays disconnected until Connect is clicked or the board is plugged in again
    const disconnect = useCallback(() => {
        paused.current = true;
        return sensor.current.disconnect();
    }, []);

    const setSettings = useCallback((patch) => {
        setSettingsState((prev) => {
            const next = { ...prev, ...patch };
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
            } catch {
                // storage unavailable: settings last for this visit only
            }
            return next;
        });
    }, []);

    return {
        status,
        connectedAt,
        station,
        readings,
        problem,
        storage,
        clearProblem: () => setProblem(''),
        settings,
        setSettings,
        connect,
        disconnect,
    };
}
