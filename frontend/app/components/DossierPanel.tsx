'use client';

import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useState } from 'react';
import { type Vessel } from '../data/fleet';

// Per-IMO vessel photo from /public/vessels/<imo>.jpg. Falls back gracefully
// when no photo is on file. Keyed by imo so load state resets per selection.
function VesselPhoto({ imo, name }: { imo: number; name: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="mt-4">
            <div className="label">vessel photo</div>
            <div className="relative mt-1.5 overflow-hidden rounded-xl edge-soft bg-ink/5">
                {failed ? (
                    <div className="flex aspect-[3/2] w-full items-center justify-center px-3 text-center font-mono text-[10px] text-ink/40">
                        no photo on file
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`/vessels/${imo}.jpg`}
                        alt={name}
                        className="block aspect-[3/2] w-full object-cover"
                        loading="lazy"
                        onError={() => setFailed(true)}
                    />
                )}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: Vessel['status'] }) {
    const confirmed = status === 'CONFIRMED';
    return (
        <span
            className={clsx(
                'rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]',
                confirmed
                    ? 'bg-red-500/15 text-red-600'
                    : 'bg-amber-400/20 text-amber-700',
            )}
        >
            {confirmed ? '● confirmed · ofac' : '● suspected · unverified'}
        </span>
    );
}

export default function DossierPanel({
    vessel,
    onClose,
}: {
    vessel: Vessel | null;
    onClose: () => void;
}) {
    return (
        <AnimatePresence mode="wait">
            {vessel && (
                <motion.aside
                    key={vessel.imo}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                    className="absolute right-5 top-24 hidden w-[340px] md:block"
                >
                    <div className="rounded-2xl glass edge overflow-hidden">
                        <div className="flex items-center justify-between divider px-4 py-2.5">
                            <span className="label">
                                dossier · {vessel.imoKnown ? `imo ${vessel.imo}` : 'unidentified'}
                            </span>
                            <button
                                onClick={onClose}
                                className="label hover:text-ink transition-colors"
                                title="clear selection"
                            >
                                ✕ close
                            </button>
                        </div>

                        <div className="px-5 py-4">
                            <div className="font-display text-2xl leading-none text-ink">
                                {vessel.name}
                            </div>

                            <div className="mt-3">
                                <StatusBadge status={vessel.status} />
                            </div>

                            {vessel.aisName && vessel.aisName !== vessel.name && (
                                <div className="mt-3 rounded-xl bg-amber-50/80 edge-soft px-3 py-2 font-mono text-[11px] leading-snug text-amber-800">
                                    ⚠ broadcasting as &lsquo;{vessel.aisName}&rsquo; — identity mismatch
                                </div>
                            )}

                            <VesselPhoto
                                key={vessel.imo}
                                imo={vessel.imo}
                                name={vessel.name}
                            />

                            <div className="mt-4">
                                <div className="label">position</div>
                                <div className="mt-1 font-mono text-[10px] text-ink/70 tabular">
                                    {vessel.lastLL[0].toFixed(4)}, {vessel.lastLL[1].toFixed(4)}
                                </div>
                                <div className="font-mono text-[10px] text-ink/55 tabular">
                                    {vessel.lastAisAt}
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="label">sanction program</div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {vessel.sanctions.map((s) => (
                                        <span
                                            key={s}
                                            className="rounded-full bg-turq-50/80 edge-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/80"
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-5 divider-t pt-3">
                                <div className="label">
                                    signature · ed25519 · {vessel.origin} ✓
                                </div>
                                <div className="mt-1 break-all font-mono text-[9px] leading-relaxed text-turq-700/90">
                                    {vessel.sig || '—'}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
