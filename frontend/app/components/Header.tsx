'use client';

export default function Header() {
    return (
        <header className="fixed inset-x-0 top-0 z-50">
            <div className="mx-3 mt-3 flex h-14 items-center justify-between px-5">
                <div className="flex items-center gap-4">
                    <span className="font-display text-xl tracking-tight text-ink">
                        LEVIATHAN
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 rounded-full glass-soft edge px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink/70">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-turq-400 turq-glow-soft animate-pulse" />
                        live · network
                    </span>
                </div>
            </div>
        </header>
    );
}
