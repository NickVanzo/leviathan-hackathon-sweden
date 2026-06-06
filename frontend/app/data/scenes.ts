// Curated Earth-observation scenes for the Verification funnel.
//
// A Scene is one real Sentinel-1 acquisition over an AOI. This module is the
// authoritative source for the AOI geometry, the acquisition window, and the
// illustrative AIS-matched ("normal") boats shown for context. It does NOT list
// dark candidates: those are owned by the Mirror (seeded as SUSPECTED records in
// data/seed-detections.json) and read live off the detections feed, so an
// operator confirmation flips them in place. Matched boats are never signed and
// never appear on the globe or in the registry — Scene-view context only.

export type SceneDetection = {
    id: string;
    lat: number;
    lon: number;
    size_m: number;
};

export type SceneAOI = {
    west: number;
    south: number;
    east: number;
    north: number;
};

export type Scene = {
    id: string;
    label: string;
    aoi: SceneAOI;
    /** Acquisition instant (the moment AIS is cross-checked against). */
    acquired: string;
    /** SAR fetch window bracketing the acquisition (verified to return a pass). */
    from: string;
    to: string;
    sensor: string;
    /** AIS-matched boats only — illustrative context, never signed. */
    matched: readonly SceneDetection[];
};

export const SCENES: readonly Scene[] = [
    {
        id: 'scene-bornholm-0914',
        label: 'Bornholm Basin',
        aoi: { west: 14.4, south: 55.2, east: 15.2, north: 55.6 },
        acquired: '2025-09-14T05:15:00Z',
        from: '2025-09-13T00:00:00Z',
        to: '2025-09-15T23:59:59Z',
        sensor: 'sentinel-1-grd',
        // AIS-matched boats, aligned to real Sentinel-1 ship returns. The
        // top-right and lower-left returns are promoted to dark candidates
        // (seeded into the mesh), so they are intentionally not listed here.
        matched: [
            { id: 'scene-bornholm-0914-m1', lat: 55.4637, lon: 14.6719, size_m: 150 },
            { id: 'scene-bornholm-0914-m2', lat: 55.4137, lon: 14.6418, size_m: 205 },
        ],
    },
];

const RADIUS_M = 500;

/** AIS cross-check line for a dark candidate, e.g. "no AIS within 500 m at 05:15 UTC". */
export function aisCrosscheckLabel(scene: Scene): string {
    const hhmm = scene.acquired.slice(11, 16);
    return `no AIS within ${RADIUS_M} m at ${hhmm} UTC`;
}

/** Map a lat/lon to a percentage position within the AOI image box. */
export function detectionToPct(
    aoi: SceneAOI,
    lat: number,
    lon: number,
): { leftPct: number; topPct: number } {
    const leftPct = ((lon - aoi.west) / (aoi.east - aoi.west)) * 100;
    const topPct = ((aoi.north - lat) / (aoi.north - aoi.south)) * 100;
    return { leftPct, topPct };
}
