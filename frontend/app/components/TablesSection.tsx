'use client';

import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { type Vessel } from '../data/fleet';
import { NODES, fetchHealth, type NodeHealth } from '../lib/mesh';

const HEALTH_POLL_MS = 2_000;

type NodeStatus = {
    id: string;
    url: string;
    pubkey: string;
    health: NodeHealth | null;
};

function useNodeHealth(): NodeStatus[] {
    const [status, setStatus] = useState<NodeStatus[]>(
        NODES.map((n) => ({ id: n.id, url: n.url, pubkey: n.pubkey, health: null })),
    );

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const results = await Promise.all(
                NODES.map(async (n) => ({
                    id: n.id,
                    url: n.url,
                    pubkey: n.pubkey,
                    health: await fetchHealth(n.url),
                })),
            );
            if (!cancelled) setStatus(results);
        };
        void load();
        const id = setInterval(() => void load(), HEALTH_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    return status;
}

function StatusBadge({ status }: { status: Vessel['status'] }) {
    const confirmed = status === 'CONFIRMED';
    return (
        <span
            className={clsx(
                'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]',
                confirmed
                    ? 'bg-red-500/15 text-red-600'
                    : 'bg-amber-400/20 text-amber-700',
            )}
        >
            {confirmed ? 'confirmed' : 'suspected'}
        </span>
    );
}

function VesselRowView({ v, onSelect }: { v: Vessel; onSelect: () => void }) {
    return (
        <tr className="divider transition-colors hover:bg-turq-50/50">
            <td className="px-4 py-3">
                <button onClick={onSelect} className="text-left" title="focus on globe">
                    <div className="font-display text-[13px] tracking-tight text-ink hover:text-turq-700">
                        {v.name}
                    </div>
                    {v.aisName && v.aisName !== v.name && (
                        <div className="font-mono text-[10px] text-amber-700">
                            ⚠ ais: {v.aisName}
                        </div>
                    )}
                </button>
            </td>
            <td className="px-4 py-3 font-mono text-[12px] text-ink tabular">
                {v.imoKnown ? v.imo : <span className="text-ink/35">—</span>}
            </td>
            <td className="px-4 py-3">
                <StatusBadge status={v.status} />
            </td>
            <td
                className="px-4 py-3 font-mono text-[11px] text-ink/80 truncate max-w-[200px]"
                title={v.program}
            >
                {v.program || <span className="text-ink/35">—</span>}
            </td>
            <td className="px-4 py-3 font-mono text-[11px] text-ink/80 tabular">
                {v.lastAisAt}
            </td>
            <td className="px-4 py-3 font-mono text-[12px] text-ink tabular">{v.sightings}</td>
        </tr>
    );
}

function StatusRow({ colSpan, message }: { colSpan: number; message: string }) {
    return (
        <tr>
            <td
                colSpan={colSpan}
                className="px-4 py-10 text-center font-mono text-[11px] text-ink/35"
            >
                {message}
            </td>
        </tr>
    );
}

function NodeCard({ node }: { node: NodeStatus }) {
    const alive = node.health !== null;
    return (
        <div className="rounded-2xl glass edge px-5 py-4">
            <div className="flex items-center justify-between">
                <span className="font-display text-[15px] tracking-tight text-ink">
                    {node.id}
                </span>
                <span
                    className={clsx(
                        'flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]',
                        alive ? 'text-turq-700' : 'text-red-600',
                    )}
                >
                    <span
                        className={clsx(
                            'inline-block h-1.5 w-1.5 rounded-full',
                            alive ? 'bg-turq-400 turq-glow-soft' : 'bg-red-500',
                        )}
                    />
                    {alive ? 'online' : 'unreachable'}
                </span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-ink/45">
                {node.url.replace('http://', '')}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                    <div className="label">records</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink tabular">
                        {node.health?.records ?? '—'}
                    </div>
                </div>
                <div>
                    <div className="label">rejected</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink/70 tabular">
                        {node.health?.rejected ?? '—'}
                    </div>
                </div>
            </div>
            <div className="mt-3 break-all font-mono text-[9px] leading-relaxed text-ink/45">
                pubkey: {node.pubkey}
            </div>
        </div>
    );
}

export default function TablesSection({
    vessels,
    onFocusVessel,
}: {
    vessels: readonly Vessel[];
    onFocusVessel: (imo: number) => void;
}) {
    const nodes = useNodeHealth();
    const aliveCount = nodes.filter((n) => n.health !== null).length;
    const totalRejected = nodes.reduce(
        (sum, n) => sum + (n.health?.rejected ?? 0),
        0,
    );

    return (
        <section
            id="data"
            className="snap-start relative min-h-screen px-6 pt-28 pb-20"
        >
            <div className="mx-auto max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    viewport={{ once: true, amount: 0.2 }}
                >
                    <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none text-ink">
                        registry
                    </h2>
                </motion.div>

                {/* VESSELS ─────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    viewport={{ once: true, amount: 0.2 }}
                    className="mt-10"
                >
                    <div className="flex items-center justify-between px-1">
                        <span className="label">vessels · {vessels.length}</span>
                    </div>

                    <div className="mt-3 rounded-2xl glass edge overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="divider">
                                    {[
                                        'vessel',
                                        'imo',
                                        'status',
                                        'program',
                                        'last seen',
                                        'sightings',
                                    ].map((h) => (
                                        <th
                                            key={h}
                                            className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/55"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {vessels.length === 0 ? (
                                    <StatusRow colSpan={6} message="— awaiting detections from the network —" />
                                ) : (
                                    vessels.map((v) => (
                                        <VesselRowView
                                            key={v.imo}
                                            v={v}
                                            onSelect={() => onFocusVessel(v.imo)}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* NODES ───────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    viewport={{ once: true, amount: 0.2 }}
                    className="mt-12"
                >
                    <div className="flex items-center justify-between px-1">
                        <span className="label">
                            network nodes · {aliveCount}/{nodes.length} online
                        </span>
                        <span className="label text-ink/55">
                            forged-rejected · {totalRejected}
                        </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {nodes.map((n) => (
                            <NodeCard key={n.id} node={n} />
                        ))}
                    </div>

                    <p className="mt-3 px-1 font-mono text-[11px] text-ink/45">
                        Each node independently verifies every gossiped record&rsquo;s
                        Ed25519 signature and refuses forgeries. The network survives any
                        single node going dark.
                    </p>
                </motion.div>

                <div className="mt-16 divider-t pt-4 flex items-center justify-between">
                    <span className="label">baltic maritime intelligence</span>
                    <span className="label text-ink/35">ed25519 · gossip · 3-node network</span>
                </div>
            </div>
        </section>
    );
}
