import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import styles from './Instrument.module.css';

const BASE_STATE = {
    heading: 62,
    battery: 76,
    voltage: 15.2,
    minutesLeft: 11,
    satellites: 15,
    hdop: 0.8,
    distanceHome: 680,
    nextWaypoint: 240,
    altitudeRel: 42.0,
    velocity: 8.4,
    climb: 0.3,
    signal: -72,
    heartbeat: 0.4,
    loss: 1.2,
};

const CARDINALS = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
];

// Home point elevation, added to relative altitude for AMSL.
const HOME_ELEVATION = 15;
const CENTER = 300;
const RING_RADIUS = 280;
const CELL_COUNT = 6;

// Point on a circle around the instrument centre, 0° = up, clockwise.
function polar(radius, angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

function jitter(value, spread, decimals = 1) {
    const next = value + (Math.random() - 0.5) * spread;
    return Number(next.toFixed(decimals));
}

function Stat({ label, value, unit, sub, icon, side }) {
    return (
        <div className={`${styles.stat} ${side === 'right' ? styles.statRight : ''}`}>
            <span className={styles.connector}></span>
            <p className={styles.statLabel}>{label}</p>
            <p className={styles.statValue}>
                {icon}
                <span>{value}</span>
                {unit && <span className={styles.statUnit}>{unit}</span>}
            </p>
            <p className={styles.statSub}>{sub}</p>
        </div>
    );
}

function Rotor({ x, y, spin }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r="54" className={styles.rotorGuard} />
            <path d="M -32 -40 A 51 51 0 0 1 32 -40" className={styles.rotorArc} />
            <g className={styles.propeller} style={{ animationDirection: spin }}>
                <ellipse rx="38" ry="9" className={styles.propBlade} transform="rotate(-12)" />
                <line x1="-4" y1="-30" x2="4" y2="30" className={styles.propShaft} />
                <circle r="3" className={styles.propHub} />
            </g>
        </g>
    );
}

function DroneView({ heading }) {
    const rotors = [
        { x: 172, y: 155, spin: 'normal' },
        { x: 428, y: 175, spin: 'reverse' },
        { x: 158, y: 435, spin: 'reverse' },
        { x: 414, y: 455, spin: 'normal' },
    ];

    const satellites = Array.from({ length: 18 }, (_, i) => {
        const angle = i * 20 + 8;
        const radius = 300 + (i % 3) * 8;
        return polar(radius, angle);
    });

    const ticks = Array.from({ length: 12 }, (_, i) => i * 30 + 15);

    return (
        <svg className={styles.droneSvg} viewBox="0 0 600 600" role="img" aria-label={`Drone top view, heading ${heading} degrees`}>
            <defs>
                <radialGradient id="instrumentGlow">
                    <stop offset="0%" stopColor="rgba(45, 212, 191, 0.10)" />
                    <stop offset="100%" stopColor="rgba(45, 212, 191, 0)" />
                </radialGradient>
                <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b5d58" />
                    <stop offset="100%" stopColor="#363834" />
                </linearGradient>
            </defs>

            {/* Satellite / beacon markers */}
            {satellites.map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="3.5" className={styles.satellite} />
            ))}

            {/* Compass ring rotates opposite to heading so the drone always points up */}
            <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} className={styles.ringOuter} />
            <circle cx={CENTER} cy={CENTER} r={RING_RADIUS - 16} className={styles.ringDotted} />
            <g style={{ transform: `rotate(${-heading}deg)`, transformOrigin: `${CENTER}px ${CENTER}px` }} className={styles.compassRose}>
                {ticks.map((angle) => {
                    const [x1, y1] = polar(RING_RADIUS - 6, angle);
                    const [x2, y2] = polar(RING_RADIUS - 24, angle);
                    return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} className={styles.tick} />;
                })}
                {CARDINALS.map(({ label, angle }) => {
                    const [x1, y1] = polar(RING_RADIUS - 6, angle);
                    const [x2, y2] = polar(RING_RADIUS - 24, angle);
                    const [tx, ty] = polar(RING_RADIUS + 14, angle);
                    return (
                        <g key={label}>
                            <line x1={x1} y1={y1} x2={x2} y2={y2} className={styles.tickMajor} />
                            <text x={tx} y={ty} transform={`rotate(${angle} ${tx} ${ty})`} className={styles.cardinal}>
                                {label}
                            </text>
                        </g>
                    );
                })}
            </g>

            {/* Heading indicator */}
            <path d={`M ${CENTER} 0 L ${CENTER + 10} 26 L ${CENTER - 10} 26 Z`} className={styles.headingArrow} transform="translate(0 2)" />
            <text x={CENTER} y="68" className={styles.headingText}>
                {String(Math.round(heading) % 360).padStart(3, '0')}°
            </text>

            {/* Proximity rings */}
            <circle cx={CENTER} cy={CENTER} r="180" fill="url(#instrumentGlow)" />
            <circle cx={CENTER} cy={CENTER} r="145" className={styles.proximityRing} />
            <circle cx={CENTER} cy={CENTER} r="108" className={styles.proximityRing} />

            {/* Arms */}
            {rotors.map(({ x, y }, i) => (
                <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} className={styles.arm} />
            ))}

            {rotors.map((rotor, i) => (
                <Rotor key={i} {...rotor} />
            ))}

            {/* Fuselage */}
            <path
                d="M 260 235 L 340 238 L 362 268 L 358 350 L 322 392 L 278 390 L 240 348 L 242 268 Z"
                fill="url(#bodyFill)"
                className={styles.body}
            />
            <rect x="285" y="255" width="32" height="72" rx="2" transform="rotate(2 300 290)" className={styles.bodyPanel} />
            <line x1="272" y1="346" x2="326" y2="348" className={styles.bodyPanel} />
            <circle cx="278" cy="240" r="5" className={styles.ledFront} />
            <circle cx="327" cy="242" r="5" className={styles.ledFront} />
            <circle cx="270" cy="381" r="5" className={styles.ledRear} />
            <circle cx="320" cy="383" r="5" className={styles.ledRear} />
            <path d="M 288 392 L 308 393 L 304 405 L 292 405 Z" className={styles.tail} />

            {/* Fire module payload */}
            <g transform="rotate(3 295 445)">
                <rect x="250" y="413" width="88" height="62" className={styles.payloadFrame} />
                <rect x="262" y="424" width="64" height="40" className={styles.payloadBox} />
                <rect x="280" y="432" width="28" height="16" className={styles.payloadCore} />
                <circle cx="287" cy="450" r="4" className={styles.payloadWheel} />
                <circle cx="301" cy="450" r="4" className={styles.payloadWheel} />
                <text x="294" y="462" className={styles.payloadLabel}>F</text>
            </g>
        </svg>
    );
}

export default function Instrument() {
    const [telemetry, setTelemetry] = useState(BASE_STATE);
    const [demo, setDemo] = useState(false);

    useEffect(() => {
        if (!demo) return;

        const timer = setInterval(() => {
            setTelemetry((prev) => ({
                ...prev,
                // Left unwrapped so the compass keeps turning forward past 360°.
                heading: prev.heading + 1.5,
                altitudeRel: jitter(prev.altitudeRel, 0.6),
                velocity: Math.max(0, jitter(prev.velocity, 0.5)),
                climb: jitter(0.3, 0.4),
                signal: Math.round(jitter(-72, 4, 0)),
                heartbeat: Math.max(0.1, jitter(0.4, 0.2)),
            }));
        }, 1000);

        return () => clearInterval(timer);
    }, [demo]);

    const t = telemetry;
    const filledCells = Math.round((t.battery / 100) * CELL_COUNT);

    const leftStats = [
        { label: 'ARM STATE', value: 'ARMED', icon: <Check size={18} className={styles.checkIcon} />, sub: 'FLIGHT CONTROLLER' },
        { label: 'BATTERY', value: `${t.battery}% · ${t.voltage.toFixed(1)} V`, sub: `${t.minutesLeft} MIN EST. REMAINING` },
        { label: 'GPS FIX', value: '3D FIX', sub: `${t.satellites} SAT · HDOP ${t.hdop.toFixed(1)}` },
        { label: 'DISTANCE TO HOME', value: t.distanceHome, unit: 'm', sub: `NEXT WAYPOINT · ${t.nextWaypoint} m` },
    ];

    const rightStats = [
        { label: 'FLIGHT MODE', value: 'AUTO', sub: 'ARMED · YES' },
        { label: 'ALTITUDE', value: t.altitudeRel.toFixed(1), unit: 'm REL', sub: `${(t.altitudeRel + HOME_ELEVATION).toFixed(1)} m AMSL` },
        { label: 'VELOCITY', value: t.velocity.toFixed(1), unit: 'm/s', sub: `CLIMB ${t.climb.toFixed(1)} m/s` },
        { label: 'TELEMETRY LINK', value: t.signal, unit: 'dBm', sub: `HB ${t.heartbeat.toFixed(1)} s · LOSS ${t.loss.toFixed(1)}%` },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.topSection}>
                <div>
                    <p className={styles.breadcrumb}>AIRCRAFT / DR-01</p>
                    <h1 className={styles.title}>FLIGHT INSTRUMENT</h1>
                </div>
                <span className={styles.modeBadge}>AUTO</span>
            </div>

            <div className={styles.instrumentGrid}>
                <div className={styles.statColumn}>
                    {leftStats.map((stat) => (
                        <Stat key={stat.label} side="left" {...stat} />
                    ))}
                </div>

                <div className={styles.centerColumn}>
                    <p className={styles.viewLabel}>DR-01 / TOP VIEW</p>
                    <DroneView heading={t.heading} />

                    <div className={styles.cellBar}>
                        <div className={styles.cells}>
                            {Array.from({ length: CELL_COUNT }, (_, i) => (
                                <span key={i} className={`${styles.cell} ${i < filledCells ? styles.cellFilled : ''}`}></span>
                            ))}
                        </div>
                        <span>{t.battery}% CELL CAPACITY</span>
                    </div>
                </div>

                <div className={styles.statColumn}>
                    {rightStats.map((stat) => (
                        <Stat key={stat.label} side="right" {...stat} />
                    ))}
                </div>
            </div>

            <div className={styles.footer}>
                <button
                    className={`${styles.demoBtn} ${demo ? styles.demoActive : ''}`}
                    onClick={() => setDemo(!demo)}>
                    {demo ? 'STOP DEMO' : 'DEMO STATE'}
                </button>
            </div>
        </div>
    );
}
