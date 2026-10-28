import { Fragment, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import styles from './FlightWeather.module.css';
import { Card, Chip, Segmented } from '../ui';
import { VERDICT_TONE, VERDICT_LABEL, compass, describeWeather, formatCoords, formatVisibility, hourOf, isLiveLocation } from '../../utils/flightWeather';

const orDash = (value, unit = '') => (value == null ? '—' : `${value}${unit}`);
const RANK = { GO: 0, CAUTION: 1, 'NO-GO': 2 };

// What the location line says when the device position isn't being used
const LOCATION_NOTE = {
    locating: 'Finding this device… showing default site',
    denied: 'Location blocked — showing default site',
    unavailable: 'No device location — showing default site',
};

// Weather where this device is (default site until it has a fix) and whether it is safe
// to fly: the verdict and why, then a tab each for current readings and the hourly outlook.
// `device` comes from useDeviceLocation, `weather`/`error` from useFlightWeather(device.coords);
// the page owns both so its header can show the same location.
export default function FlightWeather({ device, weather, error, className = '' }) {
    const [tab, setTab] = useState('now');

    if (!weather) {
        return (
            <Card title="Flight weather" className={className}>
                <p className={styles.hint}>{error ?? 'Checking the weather…'}</p>
            </Card>
        );
    }

    const { current: c, assessment, hours, location } = weather;
    const tone = VERDICT_TONE[assessment.verdict];
    // First upcoming hour that's worse than now, flagged under the verdict so it isn't missed
    const worsens = hours.find((h) => RANK[h.verdict] > RANK[assessment.verdict]);
    const live = isLiveLocation(device, weather);
    const meta = weather.stale ? (
        <Chip tone="warn">Last known</Chip>
    ) : (
        <span className={styles.meta}>
            {live && <span className={styles.liveDot} aria-hidden />}
            {live ? 'Live ·' : 'As of'} <span className="mono">{hourOf(weather.time)}</span>
        </span>
    );

    return (
        <Card title="Flight weather" meta={meta} className={className}>
            <div className={styles.place}>
                {live ? <LocateFixed aria-hidden className={styles.liveIcon} /> : <MapPin aria-hidden />}
                <div>
                    <div className={styles.placeName}>{location.name ?? 'This device'}</div>
                    {live ? (
                        <div className={`${styles.small} mono`}>
                            {formatCoords(device.coords.lat, device.coords.lon)} · ±{device.accuracy} m
                        </div>
                    ) : (
                        <div className={styles.small}>{LOCATION_NOTE[device.status] ?? formatCoords(location.lat, location.lon)}</div>
                    )}
                </div>
            </div>

            <div className={`${styles.banner} ${styles[tone]}`}>
                <div className={styles.bannerLabel}>{VERDICT_LABEL[assessment.verdict]}</div>
                <div className={styles.bannerSub}>
                    {describeWeather(c.weatherCode)} · {orDash(c.temp, ' °C')}
                </div>
            </div>
            {worsens && tab === 'now' && (
                <p className={`${styles.worsens} ${styles[VERDICT_TONE[worsens.verdict]]}`}>
                    From <span className="mono">{hourOf(worsens.time)}</span>: {worsens.reason}
                </p>
            )}

            <div className={styles.tabs}>
                <Segmented
                    options={[
                        { key: 'now', label: 'Now' },
                        { key: 'next', label: `Next ${hours.length} hours` },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            {tab === 'now' ? (
                <>
                    <p className={styles.section}>Why</p>
                    <ul className={styles.reasons}>
                        {assessment.reasons.map((r) => (
                            <li key={r.text} className={styles[VERDICT_TONE[r.level]]}>{r.text}</li>
                        ))}
                    </ul>

                    <p className={styles.section}>Readings</p>
                    <dl className={styles.readings}>
                        {[
                            ['Wind 10 m', `${orDash(c.wind, ' m/s')} ${compass(c.windDirection)}`],
                            ['Wind 80 m', orDash(c.windAloft, ' m/s')],
                            ['Gusts', orDash(c.gust, ' m/s')],
                            ['Rain', `${orDash(c.rain, ' mm/h')} · ${orDash(c.rainChance, '%')}`],
                            ['Cloud', orDash(c.cloudCover, '%')],
                            ['Visibility', formatVisibility(c.visibility)],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd className="mono">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </>
            ) : (
                <table className={styles.hours}>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Fly</th>
                            <th>Wind / gust</th>
                            <th>Rain</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hours.map((h) => (
                            <Fragment key={h.time}>
                                <tr className={h.reason ? styles.flagged : ''} title={describeWeather(h.weatherCode)}>
                                    <td className="mono">{hourOf(h.time)}</td>
                                    <td><span className={`${styles.dot} ${styles[VERDICT_TONE[h.verdict]]}`} aria-label={h.verdict} /></td>
                                    <td className="mono">{orDash(Math.max(h.wind ?? 0, h.windAloft ?? 0))}<span className={styles.unit}> / {orDash(h.gust)}</span></td>
                                    <td className="mono">{h.rain > 0 ? `${h.rain} mm` : orDash(h.rainChance, '%')}</td>
                                </tr>
                                {h.reason && (
                                    <tr>
                                        <td colSpan={4} className={`${styles.why} ${styles[VERDICT_TONE[h.verdict]]}`}>{h.reason}</td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            )}
            {tab === 'next' && (
                <p className={`${styles.small} ${styles.source}`}>
                    Open-Meteo forecast · ~10 km grid
                </p>
            )}
        </Card>
    );
}
