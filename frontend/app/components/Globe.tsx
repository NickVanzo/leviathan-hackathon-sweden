'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vessel } from '../data/fleet';
import type { Scene } from '../data/scenes';

// Minimal structural type for the OrbitControls instance we get back from
// drei's <OrbitControls ref={...} />. We only touch its event-emitter API,
// so we avoid the three-stdlib type import (not hoisted in this workspace).
type OrbitControlsImpl = {
    addEventListener: (type: 'start' | 'change' | 'end', cb: () => void) => void;
    removeEventListener: (type: 'start' | 'change' | 'end', cb: () => void) => void;
    update: () => boolean;
};

const TEX_EARTH = '/earth_2048.jpg';

const R = 2;

// Module-scope cache for the sampled continent point buffers.
// CPU sampling (canvas + getImageData + ~131k pixel scan) runs exactly once
// per browser session; subsequent mounts (StrictMode double-mount, route
// changes, modal remounts) reuse these arrays.
let CACHED_TARGET: Float32Array | null = null;
let CACHED_START:  Float32Array | null = null;

// ── entrance animation timings (seconds, from canvas mount) ────────────────
const STIPPLE_FLY_DUR = 1.6;          // dots fly in
const STIPPLE_FADE_DUR = 0.6;         // dots fade in (concurrent)
const PING_BASE_DELAY = STIPPLE_FLY_DUR + 0.15;  // first ping appears here
const PING_STAGGER    = 0.09;         // between successive pings
const PING_FADE_DUR   = 0.45;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01      = (x: number) => Math.max(0, Math.min(1, x));

function llToVec3(lat: number, lon: number, r: number) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
    );
}

function arcPoints(a: THREE.Vector3, b: THREE.Vector3, lift = 0.6, segs = 96) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(a.length() + lift);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return curve.getPoints(segs);
}

// ── Stippled continents with fly-in (GPU shader; one uniform write per frame) ──
// Mirrors three.js PointsMaterial size-attenuation: gl_PointSize ∝
// world-size * (viewportHeight/2) / -mv.z. uViewportH is the canvas height
// in physical pixels, set from the renderer each frame.
const STIPPLE_VERT = /* glsl */ `
attribute vec3 aTarget;
uniform float uProgress;
uniform float uSize;
uniform float uViewportH;
void main() {
    vec3 pos = mix(position, aTarget, uProgress);
    vec4 mv  = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (uViewportH * 0.5) / max(-mv.z, 0.0001);
}
`;

const STIPPLE_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uOpacity;
void main() {
    vec2 uv = gl_PointCoord - 0.5;
    if (length(uv) > 0.5) discard;
    gl_FragColor = vec4(uColor, uOpacity);
}
`;

function buildStippleBuffers(img: HTMLImageElement): {
    start: Float32Array;
    target: Float32Array;
} {
    const w = 512;
    const h = 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { start: new Float32Array(0), target: new Float32Array(0) };
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const targets: number[] = [];
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const land = r + g > b + 25 && r + g + b > 110;
            if (!land) continue;
            const lon = (x / w) * 360 - 180;
            const lat = 90 - (y / h) * 180;
            const v = llToVec3(lat, lon, R + 0.02);
            targets.push(v.x, v.y, v.z);
        }
    }

    const target = new Float32Array(targets);
    const start  = new Float32Array(target.length);
    for (let i = 0; i < target.length; i += 3) {
        const f  = 4.5 + Math.random() * 2.5;
        const jx = (Math.random() - 0.5) * 0.6;
        const jy = (Math.random() - 0.5) * 0.6;
        const jz = (Math.random() - 0.5) * 0.6;
        start[i]     = target[i]     * f + jx;
        start[i + 1] = target[i + 1] * f + jy;
        start[i + 2] = target[i + 2] * f + jz;
    }
    return { start, target };
}

function ContinentStipple() {
    const tex = useLoader(THREE.TextureLoader, TEX_EARTH) as THREE.Texture;
    const matRef = useRef<THREE.ShaderMaterial>(null!);

    const geom = useMemo(() => {
        let start: Float32Array;
        let target: Float32Array;

        if (CACHED_START && CACHED_TARGET) {
            start  = CACHED_START;
            target = CACHED_TARGET;
        } else {
            const img = tex.image as HTMLImageElement | undefined;
            if (!img || !img.width) return new THREE.BufferGeometry();
            const built = buildStippleBuffers(img);
            CACHED_START  = built.start;
            CACHED_TARGET = built.target;
            start  = built.start;
            target = built.target;
        }

        const g = new THREE.BufferGeometry();
        // `position` holds the start (off-globe) coords; the shader interpolates
        // toward `aTarget` via the uProgress uniform — no per-frame CPU work.
        g.setAttribute('position', new THREE.BufferAttribute(start, 3));
        g.setAttribute('aTarget',  new THREE.BufferAttribute(target, 3));
        return g;
    }, [tex]);

    const uniforms = useMemo(
        () => ({
            uProgress:  { value: 0 },
            uOpacity:   { value: 0 },
            uColor:     { value: new THREE.Color('#0e8d84') },
            uSize:      { value: 0.018 }, // world-units; matches old PointsMaterial.size
            uViewportH: { value: 1080 },  // updated each frame from gl.domElement
        }),
        [],
    );

    useFrame((s) => {
        if (!matRef.current) return;
        const elapsed = s.clock.elapsedTime;
        const t = clamp01(elapsed / STIPPLE_FLY_DUR);
        const e = easeOutCubic(t);
        matRef.current.uniforms.uProgress.value  = e;
        matRef.current.uniforms.uOpacity.value   = 0.95 * clamp01(elapsed / STIPPLE_FADE_DUR);
        // physical-pixel viewport height for size attenuation
        const dpr = s.gl.getPixelRatio();
        const h   = s.gl.domElement.height || s.size.height * dpr;
        matRef.current.uniforms.uViewportH.value = h;
    });

    return (
        <points geometry={geom} renderOrder={10}>
            <shaderMaterial
                ref={matRef}
                vertexShader={STIPPLE_VERT}
                fragmentShader={STIPPLE_FRAG}
                uniforms={uniforms}
                transparent
                depthWrite={false}
            />
        </points>
    );
}

// ── Lat/lon turquoise wireframe overlay ────────────────────────────────────
function Wireframe() {
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame((s) => {
        if (matRef.current) {
            matRef.current.opacity = 0.18 * clamp01(s.clock.elapsedTime / STIPPLE_FADE_DUR);
        }
    });
    return (
        <mesh>
            <sphereGeometry args={[R + 0.003, 36, 24]} />
            <meshBasicMaterial ref={matRef} color="#1ed1c5" wireframe transparent opacity={0} />
        </mesh>
    );
}

// ── Matte bone sphere base ────────────────────────────────────────────────
// Opaque so it writes to the depth buffer cleanly; points (transparent) then
// pass depth test and render on top of the front-facing hemisphere.
function BoneSphere() {
    return (
        <mesh>
            <sphereGeometry args={[R, 96, 96]} />
            <meshBasicMaterial color="#f7f3eb" />
        </mesh>
    );
}

// ── Turquoise rim atmosphere ──────────────────────────────────────────────
function RimAtmosphere() {
    const m1 = useRef<THREE.MeshBasicMaterial>(null!);
    const m2 = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame((s) => {
        const k = clamp01(s.clock.elapsedTime / STIPPLE_FADE_DUR);
        if (m1.current) m1.current.opacity = 0.06 * k;
        if (m2.current) m2.current.opacity = 0.03 * k;
    });
    return (
        <>
            <mesh>
                <sphereGeometry args={[R * 1.06, 64, 64]} />
                <meshBasicMaterial ref={m1} color="#1ed1c5" transparent opacity={0} side={THREE.BackSide} />
            </mesh>
            <mesh>
                <sphereGeometry args={[R * 1.14, 64, 64]} />
                <meshBasicMaterial ref={m2} color="#1ed1c5" transparent opacity={0} side={THREE.BackSide} />
            </mesh>
        </>
    );
}

// ── A single vessel ping (always-on; staggered fade-in on entrance) ───────
function Ping({
    index,
    vessel,
    selected,
    onSelect,
    dragRef,
}: {
    index: number;
    vessel: Vessel;
    selected: boolean;
    onSelect: () => void;
    dragRef: React.MutableRefObject<boolean>;
}) {
    const point = useMemo(() => llToVec3(vessel.lastLL[0], vessel.lastLL[1], R + 0.01), [vessel]);
    const groupRef = useRef<THREE.Group>(null!);
    const haloRef  = useRef<THREE.Mesh>(null!);
    const coreMatRef = useRef<THREE.MeshBasicMaterial>(null!);
    const haloMatRef = useRef<THREE.MeshBasicMaterial>(null!);
    const seed = (vessel.imo % 100) / 100;
    const appearAt = PING_BASE_DELAY + index * PING_STAGGER;

    useFrame((s) => {
        const elapsed = s.clock.elapsedTime;

        // entrance gating
        const local = elapsed - appearAt;
        const visible = local >= 0;
        if (groupRef.current) groupRef.current.visible = visible;
        if (!visible) return;

        const v  = clamp01(local / PING_FADE_DUR);
        const ev = easeOutCubic(v);
        if (groupRef.current) {
            const s2 = 0.4 + 0.6 * ev;
            groupRef.current.scale.setScalar(s2);
        }
        if (coreMatRef.current) coreMatRef.current.opacity = ev;

        // halo pulse (steady-state)
        if (haloRef.current && haloMatRef.current) {
            const t = ((elapsed * 0.6 + seed) % 1);
            haloRef.current.scale.setScalar(1 + t * 2.2);
            haloMatRef.current.opacity = ev * (1 - t) * (selected ? 0.85 : 0.5);
        }
    });

    return (
        <group
            ref={groupRef}
            position={point}
            onClick={(e) => {
                // Suppress selection if this pointerup followed a drag —
                // OrbitControls already used the gesture to spin the globe.
                if (dragRef.current) return;
                e.stopPropagation();
                onSelect();
            }}
            onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                document.body.style.cursor = '';
            }}
        >
            <mesh>
                <sphereGeometry args={[selected ? 0.034 : 0.022, 16, 16]} />
                <meshBasicMaterial
                    ref={coreMatRef}
                    color={selected ? '#0d1311' : vessel.color}
                    transparent
                    opacity={0}
                    toneMapped={false}
                />
            </mesh>
            <mesh ref={haloRef}>
                <ringGeometry args={[0.026, 0.034, 32]} />
                <meshBasicMaterial
                    ref={haloMatRef}
                    color="#1ed1c5"
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
            {/* CONFIRMED marker: a steady outer ring at brighter turquoise,
                visible only when the vessel is an OFAC-confirmed match. */}
            {vessel.onChain && (
                <mesh>
                    <ringGeometry args={[0.045, 0.052, 48]} />
                    <meshBasicMaterial
                        color="#0e8d84"
                        transparent
                        opacity={0.85}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </mesh>
            )}
            <mesh>
                <sphereGeometry args={[0.1, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
}

// ── AOI footprint: a translucent coverage dome over the scene area ──
// At true scale the AOI is a few pixels wide on a radius-2 globe, so a flat
// patch is invisible and a point marker reads as just another vessel ping.
// We raise a translucent hemisphere ("coverage dome") over the area, oriented
// to the surface normal, with a bright footprint ring and a pulsing sweep.
// Decorative only — the scene is opened from the SceneFeed card, not by
// clicking this (clicking a small target on a draggable globe is unreliable).
function SceneFootprint({ scene }: { scene: Scene }) {
    const { aoi } = scene;

    // Place a group on the surface with local +Y along the outward normal, so a
    // default-pole hemisphere bulges outward as a dome.
    const { position, quaternion } = useMemo(() => {
        const surface = llToVec3(
            (aoi.north + aoi.south) / 2,
            (aoi.east + aoi.west) / 2,
            R + 0.002,
        );
        const normal = surface.clone().normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            normal,
        );
        return { position: surface, quaternion: q };
    }, [aoi]);

    const radius = 0.07;

    const sweepRef = useRef<THREE.Mesh>(null!);
    const sweepMatRef = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame((s) => {
        if (!sweepRef.current || !sweepMatRef.current) return;
        const t = (s.clock.elapsedTime * 0.5) % 1;
        sweepRef.current.scale.setScalar(0.4 + t * 1.0);
        sweepMatRef.current.opacity = (1 - t) * 0.5;
    });

    return (
        <group position={position} quaternion={quaternion}>
            {/* translucent coverage dome */}
            <mesh>
                <sphereGeometry
                    args={[radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]}
                />
                <meshBasicMaterial
                    color="#1ed1c5"
                    transparent
                    opacity={0.22}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            {/* bright footprint ring on the surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radius * 0.92, radius, 64]} />
                <meshBasicMaterial
                    color="#0e8d84"
                    transparent
                    opacity={0.95}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
            {/* pulsing sweep ring */}
            <mesh ref={sweepRef} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radius * 0.72, radius * 0.84, 64]} />
                <meshBasicMaterial
                    ref={sweepMatRef}
                    color="#1ed1c5"
                    transparent
                    opacity={0.5}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

// ── Track polyline + ghost particle, only when selected ───────────────────
// Renders the vessel's sightings as a series of arcs connecting consecutive
// track points. Drawn only when the track has ≥2 points; a single sighting
// has nowhere to draw to.
function SelectedArc({ vessel }: { vessel: Vessel }) {
    const points = useMemo(() => {
        if (vessel.track.length < 2) return [] as THREE.Vector3[];
        const out: THREE.Vector3[] = [];
        for (let i = 0; i < vessel.track.length - 1; i += 1) {
            const a = llToVec3(vessel.track[i][0], vessel.track[i][1], R);
            const b = llToVec3(vessel.track[i + 1][0], vessel.track[i + 1][1], R);
            const segLift = 0.25 + 0.1 * a.distanceTo(b);
            out.push(...arcPoints(a, b, segLift, 48));
        }
        return out;
    }, [vessel.track]);

    const lineObj = useMemo(() => {
        if (points.length < 2) return null;
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineDashedMaterial({
            color: '#1ed1c5',
            dashSize: 0.06,
            gapSize: 0.05,
            transparent: true,
            opacity: 0.95,
        });
        const line = new THREE.Line(geom, mat);
        line.computeLineDistances();
        return line;
    }, [points]);

    const head = useMemo(
        () =>
            vessel.track.length >= 1
                ? llToVec3(
                      vessel.track[vessel.track.length - 1][0],
                      vessel.track[vessel.track.length - 1][1],
                      R,
                  )
                : null,
        [vessel.track],
    );

    const ghostRef = useRef<THREE.Mesh>(null!);
    const glyphRef = useRef<THREE.Mesh>(null!);

    useFrame((s) => {
        if (points.length >= 2 && ghostRef.current) {
            const t = (s.clock.elapsedTime * 0.25) % 1;
            const idx = Math.min(points.length - 1, Math.floor(t * (points.length - 1)));
            ghostRef.current.position.copy(points[idx]);
        }
        if (glyphRef.current) glyphRef.current.rotation.y = s.clock.elapsedTime * 0.6;
    });

    if (!lineObj || !head) return null;

    return (
        <group>
            <primitive object={lineObj} />
            <mesh ref={ghostRef}>
                <sphereGeometry args={[0.022, 16, 16]} />
                <meshBasicMaterial color="#1ed1c5" toneMapped={false} />
            </mesh>
            <mesh ref={glyphRef} position={head} rotation={[0, 0, Math.PI / 4]}>
                <octahedronGeometry args={[0.07, 0]} />
                <meshBasicMaterial color="#0e8d84" wireframe toneMapped={false} />
            </mesh>
            <mesh position={head}>
                <sphereGeometry args={[0.09, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
}

// ── Idle auto-rotate; suppressed during entrance + after first interaction ─
// Transition state: a target spherical position for the camera, animated
// over time. Rotating the camera (instead of the globe) keeps OrbitControls'
// frame intact, so mouse rotation feels identical before and after a click —
// horizontal drag = azimuth, vertical drag = polar, world-Y stays "up".
type TransitionRef = React.MutableRefObject<{
    active: boolean;
    targetTheta: number;
    targetPhi: number;
    targetRadius: number;
}>;

const POLAR_MIN = Math.PI * 0.08;
const POLAR_MAX = Math.PI * 0.92;

function GlobeGroup({
    fleet,
    selectedImo,
    onSelect,
    scenes,
    interactedRef,
    transitionRef,
    dragRef,
    controlsRef,
}: {
    fleet: readonly Vessel[];
    selectedImo: number | null;
    onSelect: (imo: number) => void;
    scenes: readonly Scene[];
    interactedRef: React.MutableRefObject<boolean>;
    transitionRef: TransitionRef;
    dragRef: React.MutableRefObject<boolean>;
    controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
    const groupRef = useRef<THREE.Group>(null!);
    const { camera } = useThree();

    useEffect(() => {
        if (selectedImo == null) return;
        const v = fleet.find((s) => s.imo === selectedImo);
        if (!v) return;
        if (!groupRef.current) return;

        // Vessel's world-space direction (after current globe rotation). The
        // camera will move along this direction at its current orbit radius
        // so the ping ends up at screen center, while the globe stays in
        // its existing frame so OrbitControls keeps "up" = world Y.
        const local = llToVec3(v.lastLL[0], v.lastLL[1], R).normalize();
        const world = local.clone().applyQuaternion(groupRef.current.quaternion);
        const sph = new THREE.Spherical().setFromVector3(world);
        sph.radius = camera.position.length();
        sph.phi = Math.max(POLAR_MIN, Math.min(POLAR_MAX, sph.phi));

        transitionRef.current.targetTheta = sph.theta;
        transitionRef.current.targetPhi = sph.phi;
        transitionRef.current.targetRadius = sph.radius;
        transitionRef.current.active = true;
        interactedRef.current = true;
    }, [selectedImo, fleet, interactedRef, transitionRef, camera]);

    const idleStartAt = PING_BASE_DELAY + fleet.length * PING_STAGGER + PING_FADE_DUR;

    useFrame((s, dt) => {
        if (!groupRef.current) return;

        if (transitionRef.current.active) {
            const k = 1 - Math.pow(0.0008, dt);
            const cur = new THREE.Spherical().setFromVector3(camera.position);
            // Take the shortest azimuth path (handle the ±π wrap).
            let dTheta = transitionRef.current.targetTheta - cur.theta;
            while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
            while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
            cur.theta += dTheta * k;
            cur.phi += (transitionRef.current.targetPhi - cur.phi) * k;
            cur.radius = transitionRef.current.targetRadius;
            camera.position.setFromSpherical(cur);
            camera.lookAt(0, 0, 0);

            const dPhi = transitionRef.current.targetPhi - cur.phi;
            if (Math.abs(dTheta) < 0.003 && Math.abs(dPhi) < 0.003) {
                cur.theta = transitionRef.current.targetTheta;
                cur.phi = transitionRef.current.targetPhi;
                camera.position.setFromSpherical(cur);
                camera.lookAt(0, 0, 0);
                transitionRef.current.active = false;
                // Re-sync OrbitControls so its internal spherical matches
                // the new camera position before the user takes over.
                controlsRef.current?.update();
            }
            return;
        }

        const elapsed = s.clock.elapsedTime;
        if (!interactedRef.current && elapsed > idleStartAt) {
            groupRef.current.rotation.y -= dt * 0.05;
        }
    });

    const selected = fleet.find((s) => s.imo === selectedImo) ?? null;

    return (
        <group ref={groupRef}>
            <BoneSphere />
            <Suspense fallback={null}>
                <ContinentStipple />
            </Suspense>
            <Wireframe />
            <RimAtmosphere />
            {scenes.map((sc) => (
                <SceneFootprint key={sc.id} scene={sc} />
            ))}
            {fleet.map((s, i) => (
                <Ping
                    key={s.imo}
                    index={i}
                    vessel={s}
                    selected={selectedImo === s.imo}
                    onSelect={() => onSelect(s.imo)}
                    dragRef={dragRef}
                />
            ))}
            {selected && <SelectedArc vessel={selected} />}
        </group>
    );
}

function ControlsBridge({
    interactedRef,
    transitionRef,
    dragRef,
}: {
    interactedRef: React.MutableRefObject<boolean>;
    transitionRef: TransitionRef;
    dragRef: React.MutableRefObject<boolean>;
}) {
    const { gl } = useThree();
    useEffect(() => {
        const el = gl.domElement;
        // Distinguish a click from a drag by pointer TRAVEL, not OrbitControls
        // `change` events. With damping enabled the globe keeps emitting
        // `change` as it glides to a stop after a drag — so a click made while
        // it's still gliding fired `change` with zero pointer movement and got
        // mis-flagged as a drag, swallowing the selection. Pointer distance is
        // immune to that: damping moves the camera, not the cursor.
        let down = false;
        let startX = 0;
        let startY = 0;
        // Net press-to-release travel beyond this is a drag, not a click.
        // Generous enough for normal click jitter on a trackpad/mouse, well
        // below the travel of an intentional globe rotation.
        const DRAG_PX = 20;
        const onDown = (e: PointerEvent) => {
            down = true;
            startX = e.clientX;
            startY = e.clientY;
            dragRef.current = false;
            interactedRef.current = true;
            transitionRef.current.active = false;
        };
        const onUp = (e: PointerEvent) => {
            if (down) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                dragRef.current = dx * dx + dy * dy > DRAG_PX * DRAG_PX;
            }
            down = false;
        };
        // pointerdown on the canvas; pointerup on window in case the release
        // lands outside the canvas after a drag.
        el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerup', onUp);
        return () => {
            el.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointerup', onUp);
        };
    }, [gl, interactedRef, transitionRef, dragRef]);
    return null;
}

export default function Globe({
    fleet,
    selectedImo,
    onSelect,
    scenes,
    paused,
}: {
    fleet: readonly Vessel[];
    selectedImo: number | null;
    onSelect: (imo: number | null) => void;
    scenes: readonly Scene[];
    paused: boolean;
}) {
    const interactedRef = useRef(false);
    const dragRef = useRef(false);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const transitionRef = useRef({
        active: false,
        targetTheta: 0,
        targetPhi: 0,
        targetRadius: 0,
    });

    return (
        <Canvas
            camera={{ position: [0, 0.4, 5.6], fov: 50 }}
            dpr={[1, 2]}
            frameloop={paused ? 'demand' : 'always'}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent' }}
            onPointerMissed={() => {
                if (dragRef.current) return;
                onSelect(null);
            }}
        >
            <ambientLight intensity={0.9} />
            <Suspense fallback={null}>
                <GlobeGroup
                    fleet={fleet}
                    selectedImo={selectedImo}
                    onSelect={(imo) => onSelect(imo)}
                    scenes={scenes}
                    interactedRef={interactedRef}
                    transitionRef={transitionRef}
                    dragRef={dragRef}
                    controlsRef={controlsRef}
                />
            </Suspense>
            <ControlsBridge
                interactedRef={interactedRef}
                transitionRef={transitionRef}
                dragRef={dragRef}
            />
            <OrbitControls
                ref={controlsRef as unknown as React.Ref<never>}
                enablePan={false}
                enableZoom={false}
                rotateSpeed={0.45}
                enableDamping
                dampingFactor={0.12}
                minPolarAngle={POLAR_MIN}
                maxPolarAngle={POLAR_MAX}
            />
        </Canvas>
    );
}
