import { ArrowUpRight, X } from 'lucide-react';
import styles from './Dashboard.module.css';
import AlertCard from '../components/shared/AlertCard';
import DroneTelemetry from '../components/shared/DroneTelemetry';
import ModuleDetails from '../components/shared/ModuleDetails';
import DeviceDetails from '../components/shared/DeviceDetails';

export default function Dashboard() {
    return (
        <div className={styles.container}>
            <div className={styles.topSection}>
                <div className={styles.summary}>
                    <p className={styles.sectionTag}>— CURRENT MISSION</p>
                    <p className={styles.droneCode}>DR-024</p>
                    <h1 className={styles.missionTitle}>FIRE ASSESSMENT</h1>

                    <div className={styles.metaRow}>
                        <div className={styles.activeStatus}>
                            <span className={styles.greenDot}></span>
                            <span>ACTIVE</span>
                        </div>
                        <span>T+00:46:12</span>
                        <span>FIRE MODULE</span>
                    </div>

                    <div className={styles.infoGrid}>
                        <div className={styles.locationCol}>
                            <span className={styles.locationMain}>Barangay Bagong Silang</span>
                            <span className={styles.locationSub}>Caloocan City, Metro Manila</span>
                            <span className={styles.locationRegion}>NCR · PHILIPPINES</span>
                        </div>
                        <div>
                            <p className={styles.descriptionText}>
                                Residential fire reported near Package 6. Thermal sweep confirms two active flame sources; ground teams deployed to the adjacent block.
                            </p>
                        </div>
                    </div>

                    <AlertCard/>

                    {/* Action Buttons */}
                    <div className={styles.actionRow}>
                        <button className={styles.btnPrimary}>
                            <span>OPEN LIVE</span>
                            <ArrowUpRight size={14} />
                        </button>
                        <button className={styles.btnDanger}>
                            <span>END MISSION</span>
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <div className={styles.mapWrapper}>
                    <div className={styles.mapHeaderLine}>
                        <span>— LIVE MAP</span>
                        <span>180 M APART</span>
                    </div>

                    <div className={styles.mapFrame}>
                        <div className={styles.mapOverlayHeader}>
                            <div className={styles.mapOverlayLeft}>
                                <span className={styles.greenDot}></span>
                                <span>MISSION OVERLAY</span>
                            </div>
                            <div className={styles.mapOverlayRight}>
                                <span>FIRE · TRACKING</span>
                                <div className={styles.liveBadge}>
                                    <span className={styles.greenDot}></span>
                                    <span>LIVE</span>
                                </div>
                            </div>
                        </div>

                        {/* Compass Indicator */}
                        <div className={styles.compass}>
                            <span>N</span>
                            <div className={styles.compassLine}></div>
                        </div>

                        {/* Topographic & Tactical SVG Map */}
                        <svg 
                            className={styles.svgCanvas} 
                            viewBox="0 0 500 360" 
                            preserveAspectRatio="none"
                        >
                            <defs>
                                <pattern id="tacticalGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.8" />
                                </pattern>
                            </defs>

                            {/* Coordinate Grid */}
                            <rect width="100%" height="100%" fill="url(#tacticalGrid)" />

                            {/* Topographic Elevation Contour Lines */}
                            <path 
                                d="M 0,90 Q 120,110 240,80 T 500,120" 
                                fill="none" 
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeWidth="0.9" 
                            />
                            <path 
                                d="M 0,140 Q 150,170 300,120 T 500,170" 
                                fill="none" 
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeWidth="0.9" 
                            />
                            <path 
                                d="M 0,210 Q 160,250 320,180 T 500,240" 
                                fill="none" 
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeWidth="0.9" 
                            />
                            <path 
                                d="M 0,270 Q 180,310 350,230 T 500,300" 
                                fill="none" 
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeWidth="0.9" 
                            />

                            {/* Elevation Contours Around Fire Zone */}
                            <ellipse cx="400" cy="210" rx="90" ry="70" fill="none" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="0.8" />
                            <ellipse cx="400" cy="210" rx="60" ry="45" fill="none" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="0.8" />
                            <ellipse cx="400" cy="210" rx="30" ry="20" fill="none" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="0.8" />

                            {/* Thermal Zone Radar Rings */}
                            <circle cx="360" cy="215" r="55" fill="none" stroke="rgba(239, 68, 68, 0.12)" strokeDasharray="3 3" />
                            <circle cx="360" cy="215" r="90" fill="none" stroke="rgba(239, 68, 68, 0.06)" />

                            {/* Drone Flight Path (Cyan Trajectory) */}
                            <path 
                                d="M 50,300 Q 140,190 230,120 T 360,215" 
                                fill="none" 
                                stroke="#38bdf8" 
                                strokeWidth="2.2" 
                                strokeDasharray="6 4"
                                opacity="0.85"
                            />
                        </svg>

                        {/* Interactive Tactical Markers */}
                        {/* 1. Smoke Waypoint */}
                        <div className={styles.markerSmoke} style={{ top: '60%', left: '26%' }}>
                            <span className={styles.markerSmokeBox}>SMOKE</span>
                            <div className={styles.markerSmokeRing}></div>
                        </div>

                        {/* 2. Primary Drone Position */}
                        <div className={styles.markerDrone} style={{ top: '35%', left: '46%' }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                border: '2px solid #38bdf8',
                                background: '#0b0d0c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#38bdf8' }}></div>
                            </div>
                            <span className={styles.droneAltText}>ALT 145M</span>
                        </div>

                        {/* 3. Flame Detection 1 */}
                        <div className={styles.markerFlame} style={{ top: '30%', left: '53%' }}>
                            <span className={styles.markerFlameBox}>FLAME</span>
                            <div className={styles.markerFlameRing}></div>
                        </div>

                        {/* 4. Flame Detection 2 */}
                        <div className={styles.markerFlame} style={{ top: '56%', left: '68%' }}>
                            <span className={styles.markerFlameBox}>FLAME</span>
                            <div className={styles.markerFlameRing}></div>
                        </div>

                        {/* 5. Fire Module / Ground Base Marker */}
                        <div className={styles.markerModule} style={{ top: '65%', left: '76%' }}>
                            <div className={styles.moduleBox}>
                                <div className={styles.moduleDot}></div>
                            </div>
                            <div>
                                <div className={styles.moduleLabel}>FIRE MODULE</div>
                                <div className={styles.moduleSub}>BRGY. BAGONG SILANG</div>
                            </div>
                        </div>

                        {/* Map Footer Overlay */}
                        <div className={styles.mapOverlayFooter}>
                            <div className={styles.scaleBar}>
                                <span>—</span>
                                <span>100 M</span>
                                <span>—</span>
                            </div>
                            <span className={styles.sectorBadge}>SECTOR A1</span>
                        </div>
                    </div>

                    {/* Bottom Map Coordinates */}
                    <div className={styles.mapCoordsBar}>
                        <span>14.7392° N · 121.0198° E</span>
                        <span>180 M APART</span>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Drone & Module Status */}
            <div className={styles.statusSection}>
                <p className={styles.sectionTag}>— DRONE & MODULE STATUS</p>

                <div className={styles.statusGrid}>
                    {/* Drone Column */}
                    <DroneTelemetry/>

                    {/* Module Column */}
                    <ModuleDetails/>

                    {/* Devices Column */}
                    <DeviceDetails/>
                </div>
            </div>
        </div>
    );
}