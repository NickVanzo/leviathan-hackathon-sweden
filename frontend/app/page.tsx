'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Globe from './components/Globe';
import Header from './components/Header';
import DossierPanel from './components/DossierPanel';
import SceneFeed from './components/SceneFeed';
import SceneView from './components/SceneView';
import TablesSection from './components/TablesSection';
import { type Vessel } from './data/fleet';
import { SCENES } from './data/scenes';
import { useDetections } from './hooks/useDetections';

export default function HomePage() {
    const [selectedImo, setSelectedImo] = useState<number | null>(null);
    const [globePaused, setGlobePaused] = useState(false);
    const [sceneId, setSceneId] = useState<string | null>(null);

    const globeSectionRef = useRef<HTMLElement>(null);

    // Pause globe rendering when section scrolls out of view.
    useEffect(() => {
        const el = globeSectionRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => setGlobePaused(!entry.isIntersecting),
            { threshold: 0.05 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const onFocusVessel = useCallback((imo: number) => {
        setSelectedImo(imo);
        document.getElementById('globe')?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const detections = useDetections();
    const fleet = useMemo<readonly Vessel[]>(
        () => detections.data ?? [],
        [detections.data],
    );

    const selectedVessel =
        selectedImo != null
            ? (fleet.find((v) => v.imo === selectedImo) ?? null)
            : null;

    const selectedScene =
        sceneId != null ? (SCENES.find((s) => s.id === sceneId) ?? null) : null;
    const sceneCandidates = useMemo(
        () =>
            selectedScene
                ? fleet.filter((v) => v.scene === selectedScene.id)
                : [],
        [fleet, selectedScene],
    );

    return (
        <div className="snap-y h-screen overflow-y-scroll relative z-10">
            <Header />

            {/* SECTION 1 ── globe + HUD ─────────────────────────────────── */}
            <section
                id="globe"
                ref={globeSectionRef}
                className="snap-start relative h-screen w-full overflow-hidden"
            >
                {/* turquoise radial behind globe */}
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(ellipse at 50% 55%, rgba(30,209,197,0.15) 0%, rgba(247,243,235,0) 55%)',
                    }}
                />

                <div className="absolute inset-0">
                    <Globe
                        fleet={fleet}
                        selectedImo={selectedImo}
                        onSelect={(imo) => setSelectedImo(imo)}
                        scenes={SCENES}
                        paused={globePaused}
                    />
                </div>

                {/* HUD overlays */}
                <div className="pointer-events-none absolute inset-0">
                    <div className="pointer-events-auto">
                        <DossierPanel
                            vessel={selectedVessel}
                            onClose={() => setSelectedImo(null)}
                        />
                    </div>
                    <div className="pointer-events-auto absolute left-5 bottom-6 hidden md:block">
                        <SceneFeed
                            scenes={SCENES}
                            fleet={fleet}
                            onOpen={(id) => setSceneId(id)}
                        />
                    </div>
                </div>

                {/* scroll cue */}
                <a
                    href="#data"
                    className="pointer-events-auto absolute left-1/2 bottom-1.5 -translate-x-1/2 z-10 label hover:text-ink animate-pulse-slow"
                >
                    ▼ data
                </a>
            </section>

            {/* SECTION 2 ── tables ──────────────────────────────────────── */}
            <TablesSection vessels={fleet} onFocusVessel={onFocusVessel} />

            <SceneView
                scene={selectedScene}
                candidates={sceneCandidates}
                onClose={() => setSceneId(null)}
            />
        </div>
    );
}
