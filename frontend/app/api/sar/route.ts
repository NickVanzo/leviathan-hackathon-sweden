import { NextRequest } from 'next/server';

// Server-side proxy for Sentinel-1 SAR imagery from the Copernicus Data Space
// Sentinel Hub Process API. The OAuth client secret stays here (env, never sent
// to the browser). The Scene view points an <img> at
// /api/sar?west&south&east&north&from&to for a scene's AOI + acquisition window.

const TOKEN_URL =
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

// VV backscatter in dB, stretched -22..0 dB -> 0..1 (standard Sentinel-1
// visualisation). Calm water (~-20 dB) reads near-black; ships, wakes and
// land (~0 dB) read bright.
const EVALSCRIPT = `//VERSION=3
function setup(){return{input:["VV"],output:{bands:1}};}
function evaluatePixel(s){
  var db = 10.0*Math.log(Math.max(s.VV,1e-4))/Math.LN10;
  var v = (db + 22.0)/22.0;
  return [Math.max(0.0, Math.min(1.0, v))];
}`;

let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60_000) return cached.token;
    const id = process.env.SH_CLIENT_ID;
    const secret = process.env.SH_CLIENT_SECRET;
    if (!id || !secret) throw new Error('SH_CLIENT_ID / SH_CLIENT_SECRET not set');
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: id,
            client_secret: secret,
        }),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, expiresAt: now + j.expires_in * 1000 };
    return j.access_token;
}

export async function GET(req: NextRequest) {
    const sp = new URL(req.url).searchParams;
    const west = Number(sp.get('west'));
    const south = Number(sp.get('south'));
    const east = Number(sp.get('east'));
    const north = Number(sp.get('north'));
    const from = sp.get('from');
    const to = sp.get('to');
    if (
        [west, south, east, north].some((n) => Number.isNaN(n)) ||
        !from ||
        !to
    ) {
        return new Response('west, south, east, north, from, to required', {
            status: 400,
        });
    }

    // Pixel dimensions tracking the AOI aspect ratio (SH caps a request at
    // 2500 px/side) so overlays positioned by percentage map cleanly.
    const aspect = (east - west) / Math.max(north - south, 1e-6);
    const width = 1024;
    const height = Math.max(64, Math.round(width / Math.max(aspect, 1e-6)));

    const body = {
        input: {
            bounds: { bbox: [west, south, east, north] },
            data: [
                {
                    type: 'sentinel-1-grd',
                    dataFilter: {
                        timeRange: { from, to },
                        acquisitionMode: 'IW',
                        polarization: 'DV',
                    },
                },
            ],
        },
        output: {
            width,
            height,
            responses: [{ identifier: 'default', format: { type: 'image/jpeg' } }],
        },
        evalscript: EVALSCRIPT,
    };

    try {
        const token = await getToken();
        const res = await fetch(PROCESS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'image/jpeg',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            // No IW/DV pass over this AOI, or upstream error — let the client hide it.
            return new Response(await res.text(), { status: 502 });
        }
        const buf = await res.arrayBuffer();
        return new Response(buf, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (e) {
        return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
    }
}
