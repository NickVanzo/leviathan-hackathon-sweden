'use client';

// Data layer for the SHADOW MESH backend: three C++ nodes that gossip
// Ed25519-signed maritime detections over HTTP. The browser reads all three
// directly (the nodes send Access-Control-Allow-Origin: *).

export type DetectionFlag = 'DARK' | 'SPOOFER';
export type DetectionStatus = 'CONFIRMED' | 'SUSPECTED';

export type Detection = {
    id: string;
    lat: number;
    lon: number;
    time: string;
    size_m?: number;
    flag: DetectionFlag;
    imo: string;
    status: DetectionStatus;
    vessel_name?: string;
    vessel_program?: string;
    ais_name?: string;
    cog?: number;
    origin: string;
    origin_pubkey?: string;
    sig?: string;
    scene?: string;
    track_id?: string;
};

export type MeshNode = {
    id: string;
    url: string;
    pubkey: string;
};

export const NODES: readonly MeshNode[] = [
    { id: 'node1', url: 'http://127.0.0.1:8081', pubkey: '4mgi/tvIuSor/Isk3P5JQ/vO1PuNOAvTyQ9fSTDSNGo=' },
    { id: 'node2', url: 'http://127.0.0.1:8082', pubkey: 'z+nrvPR6jNzvGlRa7gp4WZU+pNX73GDXk8B7XzyV22c=' },
    { id: 'node3', url: 'http://127.0.0.1:8083', pubkey: 'FjIcwhr0MQGHPo7/6YgmG/XQR3n6Si90EdhqLFXiE6s=' },
] as const;

export const PRIMARY: MeshNode = NODES[0];

export type NodeHealth = {
    id: string;
    records: number;
    rejected: number;
};

export type ReportInput = {
    imo?: string;
    lat: number;
    lon: number;
    flag: DetectionFlag;
    time?: string;
    status?: DetectionStatus;
    size_m?: number;
    scene?: string;
    track_id?: string;
};

export async function fetchDetections(url: string): Promise<Detection[]> {
    const res = await fetch(`${url}/detections`, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`GET ${url}/detections → ${res.status}`);
    }
    return (await res.json()) as Detection[];
}

export async function fetchHealth(url: string): Promise<NodeHealth | null> {
    try {
        const res = await fetch(`${url}/health`, { cache: 'no-store' });
        if (!res.ok) return null;
        return (await res.json()) as NodeHealth;
    } catch {
        return null;
    }
}

export async function submitReport(
    url: string,
    report: ReportInput,
): Promise<void> {
    const body: Record<string, unknown> = {
        lat: report.lat,
        lon: report.lon,
        flag: report.flag,
        time: report.time ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    };
    if (report.imo) body.imo = report.imo;
    if (report.track_id) body.track_id = report.track_id;
    if (report.status) body.status = report.status;
    if (report.size_m != null) body.size_m = report.size_m;
    if (report.scene) body.scene = report.scene;
    const res = await fetch(`${url}/detections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`POST ${url}/detections → ${res.status}`);
    }
}
