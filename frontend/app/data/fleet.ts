// Vessel model for the SHADOW MESH frontend.
//
// Detections from the mesh are grouped by IMO into vessels. Each vessel's
// detections, sorted by time, form its track (sightings over time); the
// latest detection is its current position. Detections with an empty IMO
// become their own vessel keyed by a stable hash of their detection id.

import type { Detection, DetectionFlag, DetectionStatus } from '../lib/mesh';

export type Vessel = {
    imo: number;
    name: string;
    flag: string;
    riskScore: number;
    lastSeen: string;
    lastLL: readonly [number, number];
    suspectedLL: readonly [number, number];
    lastAisAt: string;
    aisGap: string;
    cargo: string;
    sanctions: readonly string[];
    sightings: number;
    color: string;
    verified: 'pinned' | 'illustrative';
    /** True when status === 'CONFIRMED'; drives the globe's "minted" ring. */
    onChain: boolean;
    // ── mesh fields ──────────────────────────────────────────────────────
    status: DetectionStatus;
    /** Name currently broadcast over AIS; differs from name on laundering. */
    aisName: string;
    program: string;
    origin: string;
    sigShort: string;
    /** Full base64 Ed25519 signature. */
    sig: string;
    /** Sightings as [lat, lon] points, sorted oldest → newest. */
    track: readonly (readonly [number, number])[];
    flagKind: DetectionFlag;
    /** Scene this vessel was discovered in (EO pipeline), if any. */
    scene?: string;
    /** Stable track key grouping a dark candidate with its confirmation. */
    track_id?: string;
    /** Latest size estimate in metres, if known. */
    size_m?: number;
    /** True when `imo` is a real numeric IMO; false for unidentified vessels. */
    imoKnown: boolean;
};

const CONFIRMED_COLOR = '#ff4d4d';
const SUSPECTED_COLOR = '#ffb02e';

// Stable non-negative numeric key from a string id, for empty-IMO vessels.
// Keeps React keys and selectedImo working without colliding with real IMOs
// (real IMOs are 7 digits; this is offset well above that range).
function hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) {
        h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
    }
    return 100_000_000 + (Math.abs(h) % 900_000_000);
}

function vesselKey(d: Detection): { key: number; imoNumeric: boolean } {
    if (d.imo && /^\d+$/.test(d.imo)) {
        return { key: Number(d.imo), imoNumeric: true };
    }
    if (d.imo) {
        return { key: hashId(d.imo), imoNumeric: false };
    }
    if (d.track_id) {
        return { key: hashId(d.track_id), imoNumeric: false };
    }
    return { key: hashId(d.id), imoNumeric: false };
}

function fmtTime(iso: string): string {
    if (!iso) return '—';
    return iso.replace('T', ' ').replace(/:\d{2}Z$/, 'Z');
}

function aisGap(latestIso: string): string {
    if (!latestIso) return 'unknown';
    const then = Date.parse(latestIso);
    if (Number.isNaN(then)) return 'unknown';
    const ms = Date.now() - then;
    if (ms < 0) return 'live';
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    return `${days}d ${String(hours).padStart(2, '0')}h`;
}

function sanctionsFor(latest: Detection): readonly string[] {
    if (latest.vessel_program) return [latest.vessel_program];
    return latest.status === 'CONFIRMED' ? ['OFAC SDN'] : ['UNVERIFIED'];
}

function toVessel(group: Detection[]): Vessel {
    const sorted = [...group].sort(
        (a, b) => Date.parse(a.time) - Date.parse(b.time),
    );
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : latest;
    const { key, imoNumeric } = vesselKey(latest);

    const confirmed = latest.status === 'CONFIRMED';
    const aisName = latest.ais_name ?? '';
    const name =
        latest.vessel_name || aisName || `IMO ${latest.imo || latest.id}`;
    const sizeLabel = latest.size_m ? `LOA ${latest.size_m} m` : '—';
    const sig = latest.sig ?? '';

    return {
        imo: key,
        name,
        flag: latest.flag,
        riskScore: confirmed ? 95 : 55,
        lastSeen: `${latest.lat.toFixed(2)}, ${latest.lon.toFixed(2)}`,
        lastLL: [latest.lat, latest.lon],
        suspectedLL: [prev.lat, prev.lon],
        lastAisAt: fmtTime(latest.time),
        aisGap: aisGap(latest.time),
        cargo: sizeLabel,
        sanctions: sanctionsFor(latest),
        sightings: sorted.length,
        color: confirmed ? CONFIRMED_COLOR : SUSPECTED_COLOR,
        verified: confirmed ? 'pinned' : 'illustrative',
        onChain: confirmed,
        status: latest.status,
        aisName,
        program: latest.vessel_program ?? '',
        origin: latest.origin,
        sigShort: sig ? `${sig.slice(0, 10)}…` : '—',
        sig,
        track: sorted.map((d) => [d.lat, d.lon] as const),
        flagKind: latest.flag,
        scene: latest.scene,
        track_id: latest.track_id,
        size_m: latest.size_m,
        imoKnown: imoNumeric,
    };
}

export function detectionsToVessels(detections: readonly Detection[]): Vessel[] {
    const groups = new Map<number, Detection[]>();
    for (const d of detections) {
        const { key } = vesselKey(d);
        const bucket = groups.get(key);
        if (bucket) bucket.push(d);
        else groups.set(key, [d]);
    }
    const vessels: Vessel[] = [];
    for (const group of groups.values()) {
        vessels.push(toVessel(group));
    }
    return vessels.sort((a, b) => b.riskScore - a.riskScore);
}
