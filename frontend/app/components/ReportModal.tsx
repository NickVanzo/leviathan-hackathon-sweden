'use client';

import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { type Vessel } from '../data/fleet';
import { PRIMARY, submitReport, type DetectionFlag } from '../lib/mesh';

const MANUAL = '__manual__';

// Nudge a position slightly so a re-report visibly advances the vessel's
// track on the globe rather than landing exactly on the prior sighting.
function nudge(value: number): number {
    return Number((value + 0.15).toFixed(4));
}

export default function ReportModal({
    open,
    onClose,
    vessels,
    selectedImo,
}: {
    open: boolean;
    onClose: () => void;
    vessels: readonly Vessel[];
    selectedImo: number | null;
}) {
    // Only real (numeric IMO) vessels can be re-reported by IMO.
    const trackable = useMemo(
        () => vessels.filter((v) => /^\d{1,7}$/.test(String(v.imo))),
        [vessels],
    );

    const [choice, setChoice] = useState<string>(MANUAL);
    const [imo, setImo] = useState('');
    const [lat, setLat] = useState('');
    const [lon, setLon] = useState('');
    const [flag, setFlag] = useState<DetectionFlag>('DARK');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // When opened, prefill from the currently-selected vessel if it is
    // trackable, otherwise fall back to manual entry.
    useEffect(() => {
        if (!open) return;
        const sel = trackable.find((v) => v.imo === selectedImo);
        if (sel) {
            setChoice(String(sel.imo));
            setImo(String(sel.imo));
            setLat(String(nudge(sel.lastLL[0])));
            setLon(String(nudge(sel.lastLL[1])));
            setFlag(sel.flagKind);
        } else {
            setChoice(MANUAL);
            setImo('');
            setLat('');
            setLon('');
            setFlag('DARK');
        }
        setError(null);
        // selectedImo is intentionally the only trigger besides open
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onChoose = (value: string) => {
        setChoice(value);
        if (value === MANUAL) {
            setImo('');
            return;
        }
        const v = trackable.find((t) => String(t.imo) === value);
        if (!v) return;
        setImo(String(v.imo));
        setLat(String(nudge(v.lastLL[0])));
        setLon(String(nudge(v.lastLL[1])));
        setFlag(v.flagKind);
    };

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting) onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, submitting, onClose]);

    const latNum = Number(lat);
    const lonNum = Number(lon);
    const valid =
        imo.trim() !== '' &&
        lat.trim() !== '' &&
        lon.trim() !== '' &&
        !Number.isNaN(latNum) &&
        !Number.isNaN(lonNum);

    const handleSubmit = async () => {
        if (!valid) return;
        setSubmitting(true);
        setError(null);
        try {
            await submitReport(PRIMARY.url, {
                imo: imo.trim(),
                lat: latNum,
                lon: lonNum,
                flag,
            });
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls =
        'rounded-xl bg-bone edge w-full px-4 py-2.5 font-mono text-[13px] text-ink tabular outline-none focus:turq-glow-soft';

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center"
                >
                    <div
                        onClick={() => !submitting && onClose()}
                        className="absolute inset-0 glass-ink"
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.99 }}
                        transition={{ duration: 0.22 }}
                        className="relative z-10 mx-4 w-full max-w-[480px] rounded-3xl glass-strong edge overflow-hidden"
                    >
                        <div className="flex items-center justify-between divider px-5 py-3">
                            <span className="label">operator report</span>
                            <button
                                onClick={onClose}
                                disabled={submitting}
                                className={clsx(
                                    'label transition-colors',
                                    submitting
                                        ? 'text-ink/30 cursor-not-allowed'
                                        : 'hover:text-ink',
                                )}
                                title="close"
                            >
                                ✕ close
                            </button>
                        </div>

                        <div className="px-5 py-5 space-y-4">
                            <div>
                                <label className="label block mb-1.5">vessel</label>
                                <select
                                    value={choice}
                                    onChange={(e) => onChoose(e.target.value)}
                                    className={inputCls}
                                >
                                    <option value={MANUAL}>— manual IMO —</option>
                                    {trackable.map((v) => (
                                        <option key={v.imo} value={String(v.imo)}>
                                            {v.name} · {v.imo}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="label block mb-1.5">imo number</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={imo}
                                    onChange={(e) => {
                                        setImo(e.target.value);
                                        setChoice(MANUAL);
                                    }}
                                    placeholder="e.g. 9339301"
                                    className={inputCls}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label block mb-1.5">lat</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={lat}
                                        onChange={(e) => setLat(e.target.value)}
                                        placeholder="58.8"
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className="label block mb-1.5">lon</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={lon}
                                        onChange={(e) => setLon(e.target.value)}
                                        placeholder="21.3"
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label block mb-1.5">flag</label>
                                <select
                                    value={flag}
                                    onChange={(e) => setFlag(e.target.value as DetectionFlag)}
                                    className={inputCls}
                                >
                                    <option value="DARK">DARK — no AIS</option>
                                    <option value="SPOOFER">SPOOFER — fake AIS</option>
                                </select>
                            </div>

                            {error && (
                                <div className="rounded-xl bg-red-50/80 edge-soft px-3 py-2 font-mono text-[11px] text-red-700">
                                    {error}
                                </div>
                            )}

                            <div className="divider-t pt-4 flex flex-col items-center gap-2">
                                <button
                                    onClick={() => void handleSubmit()}
                                    disabled={!valid || submitting}
                                    className={clsx(
                                        'rounded-full px-8 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-all',
                                        valid && !submitting
                                            ? 'bg-ink/90 text-bone hover:bg-turq-700 hover:turq-glow'
                                            : 'bg-ink/10 text-ink/30 cursor-not-allowed',
                                    )}
                                >
                                    {submitting ? 'signing…' : '▲ submit to network'}
                                </button>
                                <span className="label">
                                    signed &amp; gossiped by {PRIMARY.id} · ed25519
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
