'use client';

import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { type Vessel } from '../data/fleet';
import {
    type Scene,
    type SceneDetection,
    aisCrosscheckLabel,
    detectionToPct,
} from '../data/scenes';
import { PRIMARY, submitReport } from '../lib/mesh';

function sarUrl(scene: Scene): string {
    const { aoi } = scene;
    const p = new URLSearchParams({
        west: String(aoi.west),
        south: String(aoi.south),
        east: String(aoi.east),
        north: String(aoi.north),
        from: scene.from,
        to: scene.to,
    });
    return `/api/sar?${p.toString()}`;
}

function MatchedMarker({ scene, det }: { scene: Scene; det: SceneDetection }) {
    const { leftPct, topPct } = detectionToPct(scene.aoi, det.lat, det.lon);
    return (
        <span
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-turq-300/50 ring-1 ring-turq-200/60"
            title="AIS-matched"
        />
    );
}

function CandidateMarker({
    scene,
    vessel,
    selected,
    onSelect,
}: {
    scene: Scene;
    vessel: Vessel;
    selected: boolean;
    onSelect: () => void;
}) {
    const { leftPct, topPct } = detectionToPct(
        scene.aoi,
        vessel.lastLL[0],
        vessel.lastLL[1],
    );
    const confirmed = vessel.status === 'CONFIRMED';
    return (
        <button
            onClick={onSelect}
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            title={confirmed ? 'confirmed dark vessel' : 'dark candidate — no AIS'}
        >
            <span
                className={clsx(
                    'block h-3.5 w-3.5 rounded-full ring-2',
                    confirmed
                        ? 'bg-turq-500/50 ring-turq-600'
                        : 'bg-red-500/40 ring-red-500/80',
                    selected && 'ring-4',
                )}
            />
        </button>
    );
}

function CandidateDetail({ scene, vessel }: { scene: Scene; vessel: Vessel }) {
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirmed = vessel.status === 'CONFIRMED';

    const confirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await submitReport(PRIMARY.url, {
                track_id: vessel.track_id,
                lat: vessel.lastLL[0],
                lon: vessel.lastLL[1],
                flag: 'DARK',
                status: 'CONFIRMED',
                size_m: vessel.size_m,
                scene: scene.id,
            });
            setSubmitted(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="rounded-2xl glass edge px-5 py-4">
            <div className="label">dark candidate · {vessel.track_id ?? '—'}</div>
            <div
                className={clsx(
                    'mt-2 rounded-xl edge-soft px-3 py-2 font-mono text-[11px] leading-snug',
                    confirmed
                        ? 'bg-turq-50/80 text-turq-700'
                        : 'bg-red-50/80 text-red-700',
                )}
            >
                {confirmed
                    ? '✓ confirmed on site — unidentified, no AIS'
                    : `⚠ ${aisCrosscheckLabel(scene)}`}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[11px] text-ink/70 tabular">
                <div>
                    <div className="label">size</div>
                    <div className="mt-0.5">
                        {vessel.size_m ? `LOA ${vessel.size_m} m` : '—'}
                    </div>
                </div>
                <div>
                    <div className="label">position</div>
                    <div className="mt-0.5">
                        {vessel.lastLL[0].toFixed(3)}, {vessel.lastLL[1].toFixed(3)}
                    </div>
                </div>
            </div>
            {error && (
                <div className="mt-3 rounded-xl bg-red-50/80 edge-soft px-3 py-2 font-mono text-[11px] text-red-700">
                    {error}
                </div>
            )}
            <div className="mt-4">
                {confirmed ? (
                    <div className="rounded-full bg-turq-700 px-6 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-bone">
                        ✓ confirmed · signed into the network
                    </div>
                ) : submitted ? (
                    <div className="rounded-full bg-ink/10 px-6 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-ink/40">
                        confirmed · syncing…
                    </div>
                ) : (
                    <button
                        onClick={() => void confirm()}
                        disabled={submitting}
                        className={clsx(
                            'w-full rounded-full px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-all',
                            submitting
                                ? 'bg-ink/10 text-ink/30 cursor-not-allowed'
                                : 'bg-ink/90 text-bone hover:bg-turq-700 hover:turq-glow',
                        )}
                    >
                        {submitting ? 'signing…' : '▲ confirm on site'}
                    </button>
                )}
                <div className="mt-2 label text-center">
                    {confirmed
                        ? `signed by ${vessel.origin} · ${vessel.sigShort}`
                        : `signed & gossiped by ${PRIMARY.id} · ed25519`}
                </div>
            </div>
        </div>
    );
}

export default function SceneView({
    scene,
    candidates,
    onClose,
}: {
    scene: Scene | null;
    candidates: readonly Vessel[];
    onClose: () => void;
}) {
    const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        setSelectedTrack(null);
        setImgFailed(false);
    }, [scene?.id]);

    useEffect(() => {
        if (!scene) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [scene, onClose]);

    const selectedVessel =
        candidates.find((v) => v.track_id === selectedTrack) ?? null;

    // Match the image box to the AOI aspect so the full SAR frame shows without
    // cropping — overlays are positioned by AOI fraction, so the box must show
    // the whole frame for markers to land on the right pixels.
    const aoiAspect = scene
        ? (scene.aoi.east - scene.aoi.west) / (scene.aoi.north - scene.aoi.south)
        : 1;

    return (
        <AnimatePresence>
            {scene && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center"
                >
                    <div onClick={onClose} className="absolute inset-0 glass-ink" />
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.99 }}
                        transition={{ duration: 0.22 }}
                        className="relative z-10 mx-4 w-full max-w-[920px] rounded-3xl glass-strong edge overflow-hidden"
                    >
                        <div className="flex items-center justify-between divider px-5 py-3">
                            <span className="label">
                                scene · {scene.label} · {scene.sensor}
                            </span>
                            <button onClick={onClose} className="label hover:text-ink">
                                ✕ close
                            </button>
                        </div>

                        <div className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_320px]">
                            <div>
                                <div className="relative overflow-hidden rounded-2xl edge-soft bg-ink/80">
                                    {imgFailed ? (
                                        <div
                                            className="flex w-full items-center justify-center px-4 text-center font-mono text-[11px] text-bone/50"
                                            style={{ aspectRatio: aoiAspect }}
                                        >
                                            no Sentinel-1 pass available for this window
                                        </div>
                                    ) : (
                                        <div
                                            className="relative w-full"
                                            style={{ aspectRatio: aoiAspect }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={sarUrl(scene)}
                                                alt={`SAR scene ${scene.label}`}
                                                className="block h-full w-full object-cover"
                                                onError={() => setImgFailed(true)}
                                            />
                                            {scene.matched.map((d) => (
                                                <MatchedMarker key={d.id} scene={scene} det={d} />
                                            ))}
                                            {candidates.map((v) => (
                                                <CandidateMarker
                                                    key={v.track_id ?? v.imo}
                                                    scene={scene}
                                                    vessel={v}
                                                    selected={selectedTrack === v.track_id}
                                                    onSelect={() =>
                                                        setSelectedTrack(v.track_id ?? null)
                                                    }
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 flex items-center px-1 font-mono text-[10px] text-ink/55">
                                    <span className="ml-auto">
                                        acquired {scene.acquired.replace('T', ' ')}
                                    </span>
                                </div>
                            </div>

                            <div>
                                {selectedVessel ? (
                                    <CandidateDetail
                                        key={selectedVessel.track_id ?? selectedVessel.imo}
                                        scene={scene}
                                        vessel={selectedVessel}
                                    />
                                ) : (
                                    <div className="rounded-2xl glass edge px-5 py-4 font-mono text-[12px] leading-relaxed text-ink/60">
                                        {candidates.length} dark candidate(s) found — boats with
                                        no AIS at acquisition. Select a red marker to cross-check
                                        and confirm on site.
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
