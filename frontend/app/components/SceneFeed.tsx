'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { type Vessel } from '../data/fleet';
import { type Scene } from '../data/scenes';

// The reliable entry point into the Verification funnel: a large, always-visible
// satellite-scene card (real SAR thumbnail) the operator clicks to open the
// Scene view. Replaces the fragile click-the-dome-on-the-globe interaction.

function sarThumbUrl(scene: Scene): string {
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

function SceneCard({
    scene,
    candidates,
    onOpen,
}: {
    scene: Scene;
    candidates: readonly Vessel[];
    onOpen: () => void;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    const suspected = candidates.filter((v) => v.status === 'SUSPECTED').length;
    const allConfirmed = candidates.length > 0 && suspected === 0;

    return (
        <button
            onClick={onOpen}
            className="group block w-[230px] overflow-hidden rounded-2xl glass edge text-left transition-all hover:turq-glow"
            title={`Open ${scene.label} scene`}
        >
            <div className="relative aspect-[16/10] w-full bg-ink/80">
                {imgFailed ? (
                    <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-bone/40">
                        SAR feed unavailable
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={sarThumbUrl(scene)}
                        alt={`SAR scene ${scene.label}`}
                        className="block h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        loading="lazy"
                        onError={() => setImgFailed(true)}
                    />
                )}
                <span className="absolute left-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-bone/90">
                    ▦ sar · live
                </span>
            </div>
            <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                    <span className="font-display text-[13px] tracking-tight text-ink">
                        {scene.label}
                    </span>
                    <span
                        className={clsx(
                            'rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]',
                            allConfirmed
                                ? 'bg-turq-50/80 text-turq-700'
                                : 'bg-red-500/15 text-red-600',
                        )}
                    >
                        {allConfirmed ? '✓ confirmed' : `● dark ×${suspected}`}
                    </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-ink/45">
                        {scene.sensor}
                    </span>
                    <span className="font-mono text-[9px] text-turq-700/80 group-hover:text-turq-700">
                        inspect ▸
                    </span>
                </div>
            </div>
        </button>
    );
}

export default function SceneFeed({
    scenes,
    fleet,
    onOpen,
}: {
    scenes: readonly Scene[];
    fleet: readonly Vessel[];
    onOpen: (sceneId: string) => void;
}) {
    if (scenes.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <span className="label">satellite feed</span>
            {scenes.map((sc) => (
                <SceneCard
                    key={sc.id}
                    scene={sc}
                    candidates={fleet.filter((v) => v.scene === sc.id)}
                    onOpen={() => onOpen(sc.id)}
                />
            ))}
        </div>
    );
}
