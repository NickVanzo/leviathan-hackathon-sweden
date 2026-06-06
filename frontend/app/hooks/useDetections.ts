'use client';

import { useCallback, useEffect, useState } from 'react';
import { detectionsToVessels, type Vessel } from '../data/fleet';
import { fetchDetections, PRIMARY } from '../lib/mesh';

const POLL_MS = 2_000;

export type UseDetectionsResult = {
    data: Vessel[] | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
};

export function useDetections(): UseDetectionsResult {
    const [data, setData] = useState<Vessel[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const detections = await fetchDetections(PRIMARY.url);
            setData(detectionsToVessels(detections));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void load();
        const id = setInterval(() => {
            if (!cancelled) void load();
        }, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [load]);

    return { data, loading, error, refetch: () => void load() };
}
