import { useState, useEffect, useMemo } from 'react';
import { Copy, Check, CalendarDays, Clock, GitCompareArrows, Globe } from 'lucide-react';
import cronstrue from 'cronstrue';
import { CronExpressionParser } from 'cron-parser';
import { Button, Card } from '../components/ui';

/* ============================================================
 * Pure helpers — cron iteration + diff
 * ============================================================ */

const DEFAULT_TZS = [
    'local',
    'UTC',
    'America/Los_Angeles',
    'America/New_York',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney'
];

/**
 * Resolve timezone string to an IANA name. 'local' uses the browser's TZ.
 */
const resolveTz = (tz) => (tz === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : tz);

/**
 * Get next N runs (or until horizon, whichever comes first) for a cron expression.
 */
const getRuns = (expr, { count = 10, maxMs = null, tz = 'UTC' } = {}) => {
    const options = { tz: resolveTz(tz) };
    const interval = CronExpressionParser.parse(expr, options);
    const out = [];
    let i = 0;
    let safety = 5000;
    while (safety-- > 0) {
        if (count && i >= count) break;
        const next = interval.next();
        // CronExpressionParser returns CronDate — call toDate() for JS Date
        const d = typeof next.toDate === 'function' ? next.toDate() : new Date(next);
        const ms = d.getTime();
        if (maxMs !== null && ms > maxMs) break;
        out.push({ date: d, ms });
        i++;
    }
    return out;
};

/**
 * Walk two cron expressions up to a horizon, find first timestamp where one fires and the other doesn't.
 */
const findFirstDivergence = (aExpr, bExpr, { horizonMs, tz = 'UTC' }) => {
    const aRuns = getRuns(aExpr, { maxMs: horizonMs, tz });
    const bRuns = getRuns(bExpr, { maxMs: horizonMs, tz });
    const aSet = new Set(aRuns.map((r) => r.ms));
    const bSet = new Set(bRuns.map((r) => r.ms));

    // Earliest ms present in exactly one set, but we want the very first by time.
    const aOnly = aRuns.filter((r) => !bSet.has(r.ms)).map((r) => r.ms);
    const bOnly = bRuns.filter((r) => !aSet.has(r.ms)).map((r) => r.ms);
    const earliestA = aOnly.length ? aOnly[0] : null;
    const earliestB = bOnly.length ? bOnly[0] : null;

    if (earliestA === null && earliestB === null) return null;
    if (earliestA === null) return { ms: earliestB, who: 'B only' };
    if (earliestB === null) return { ms: earliestA, who: 'A only' };
    return earliestA <= earliestB
        ? { ms: earliestA, who: 'A only' }
        : { ms: earliestB, who: 'B only' };
};

/* ============================================================
 * UI bits
 * ============================================================ */

const formatRelative = (ms) => {
    const diff = ms - Date.now();
    if (diff < 0) return 'past';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `in ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `in ${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `in ${hr}h ${min % 60}m`;
    const day = Math.floor(hr / 24);
    return `in ${day}d ${hr % 24}h`;
};

const formatTime = (date, tz) => {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: resolveTz(tz),
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date);
    } catch {
        return date.toLocaleString();
    }
};

const describeCron = (expr) => {
    try {
        return cronstrue.toString(expr);
    } catch {
        return null;
    }
};

const CronInputCard = ({ id, expr, setExpr, tz, description, runs, error }) => (
    <Card title={`Crontab ${id}`}>
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    Expression
                </label>
                <input
                    type="text"
                    value={expr}
                    onChange={(e) => setExpr(e.target.value)}
                    placeholder="0 5 * * *"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-2xl font-mono text-slate-200 focus:border-blue-500 outline-none"
                />
            </div>
            {description ? (
                <div className="text-sm text-green-400 bg-green-900/20 border border-green-900/30 rounded-lg px-3 py-2">
                    {description}
                </div>
            ) : error ? (
                <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                    ⚠ {error}
                </div>
            ) : null}

            <div>
                <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                    <Clock size={12} /> Next {runs.length} runs
                </h4>
                {runs.length === 0 ? (
                    <div className="text-xs text-slate-500 italic">No upcoming runs in range.</div>
                ) : (
                    <ol className="font-mono text-xs space-y-1">
                        {runs.map((r, i) => (
                            <li key={r.ms} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-900/60">
                                <span className="text-slate-500 w-6 shrink-0">{i + 1}.</span>
                                <span className="text-slate-200 flex-1">{formatTime(r.date, tz)}</span>
                                <span className="text-slate-500 shrink-0">{formatRelative(r.ms)}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    </Card>
);

const Timeline = ({ aRuns, bRuns, tz, hours = 24 }) => {
    const horizonMs = Date.now() + hours * 3600 * 1000;
    const aInRange = aRuns.filter((r) => r.ms <= horizonMs);
    const bInRange = bRuns.filter((r) => r.ms <= horizonMs);
    const total = Math.max(aInRange.length, bInRange.length, 1);

    const Row = ({ label, runs, color, dot }) => (
        <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-6 shrink-0 font-mono">{label}</span>
            <div className="flex-1 h-7 bg-slate-900/40 rounded border border-slate-800 relative">
                {runs.map((r, i) => {
                    const pct = ((r.ms - Date.now()) / (horizonMs - Date.now())) * 100;
                    if (pct < 0 || pct > 100) return null;
                    return (
                        <div
                            key={r.ms}
                            className={`absolute top-0 bottom-0 w-0.5 ${dot}`}
                            style={{ left: `${pct}%` }}
                            title={formatTime(r.date, tz)}
                        />
                    );
                })}
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                    {runs.length} {runs.length === 1 ? 'run' : 'runs'}
                </span>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-500 px-9">
                <span>Now</span>
                <span>+{hours}h</span>
            </div>
            <Row label="A" runs={aInRange} color="blue" dot="bg-blue-400" />
            <Row label="B" runs={bInRange} color="amber" dot="bg-amber-400" />
        </div>
    );
};

/* ============================================================
 * Main
 * ============================================================ */

const CrontabDiff = () => {
    const [exprA, setExprA] = useState('*/5 * * * *');
    const [exprB, setExprB] = useState('0 * * * *');
    const [tz, setTz] = useState('local');
    const [copied, setCopied] = useState(false);

    // Per-side derived data
    const dataA = useMemo(() => {
        try {
            return {
                ok: true,
                description: describeCron(exprA),
                runs: getRuns(exprA, { count: 10, tz }),
                error: null
            };
        } catch (e) {
            return { ok: false, description: null, runs: [], error: e.message };
        }
    }, [exprA, tz]);

    const dataB = useMemo(() => {
        try {
            return {
                ok: true,
                description: describeCron(exprB),
                runs: getRuns(exprB, { count: 10, tz }),
                error: null
            };
        } catch (e) {
            return { ok: false, description: null, runs: [], error: e.message };
        }
    }, [exprB, tz]);

    // Comparison stats (next 24h, 7d)
    const comparison = useMemo(() => {
        if (!dataA.ok || !dataB.ok) return null;
        const horizon24h = Date.now() + 24 * 3600 * 1000;
        const horizon7d = Date.now() + 7 * 86400 * 1000;

        const a24 = getRuns(exprA, { maxMs: horizon24h, tz });
        const b24 = getRuns(exprB, { maxMs: horizon24h, tz });
        const aSet = new Set(a24.map((r) => r.ms));
        const bSet = new Set(b24.map((r) => r.ms));
        const overlap = a24.filter((r) => bSet.has(r.ms)).length;

        const divergence = findFirstDivergence(exprA, exprB, { horizonMs: horizon7d, tz });

        return {
            aCount24: a24.length,
            bCount24: b24.length,
            overlap,
            aOnly: a24.length - overlap,
            bOnly: b24.length - overlap,
            divergence
        };
    }, [dataA.ok, dataB.ok, exprA, exprB, tz]);

    const swap = () => {
        const tmp = exprA;
        setExprA(exprB);
        setExprB(tmp);
    };

    const copyComparison = async () => {
        if (!comparison) return;
        const lines = [
            `Crontab A: ${exprA}`,
            `Crontab B: ${exprB}`,
            `Timezone:  ${resolveTz(tz)}`,
            ``,
            `Next 24h:`,
            `  A runs:    ${comparison.aCount24}`,
            `  B runs:    ${comparison.bCount24}`,
            `  Overlap:   ${comparison.overlap}`,
            `  A only:    ${comparison.aOnly}`,
            `  B only:    ${comparison.bOnly}`
        ];
        if (comparison.divergence) {
            lines.push(
                ``,
                `First divergence (next 7d):`,
                `  ${comparison.divergence.who} at ${formatTime(new Date(comparison.divergence.ms), tz)}`
            );
        }
        await navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <CalendarDays className="text-blue-400" size={24} />
                    Crontab Diff
                </h2>
            </div>

            {/* Timezone + Swap */}
            <Card>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Globe size={16} className="text-slate-400" />
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Timezone</span>
                        <select
                            value={tz}
                            onChange={(e) => setTz(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none"
                        >
                            {DEFAULT_TZS.map((t) => (
                                <option key={t} value={t}>
                                    {t === 'local' ? `Local (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : t}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Button variant="secondary" onClick={swap} icon={GitCompareArrows}>
                        Swap A ↔ B
                    </Button>
                    <div className="text-xs text-slate-500 ml-auto font-mono">
                        Now: {formatTime(new Date(), tz)}
                    </div>
                </div>
            </Card>

            {/* Two side-by-side input cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CronInputCard
                    id="A"
                    expr={exprA}
                    setExpr={setExprA}
                    tz={tz}
                    description={dataA.description}
                    runs={dataA.runs}
                    error={dataA.error}
                />
                <CronInputCard
                    id="B"
                    expr={exprB}
                    setExpr={setExprB}
                    tz={tz}
                    description={dataB.description}
                    runs={dataB.runs}
                    error={dataB.error}
                />
            </div>

            {/* Comparison */}
            {comparison && (
                <Card title="Comparison">
                    <div className="flex flex-col gap-5">
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Stat label="A runs / 24h" value={comparison.aCount24} color="blue" />
                            <Stat label="B runs / 24h" value={comparison.bCount24} color="amber" />
                            <Stat label="Overlap" value={comparison.overlap} color="green" />
                            <Stat label="A only" value={comparison.aOnly} color="blue" />
                            <Stat label="B only" value={comparison.bOnly} color="amber" />
                        </div>

                        {/* First divergence */}
                        <div className="border-t border-slate-800 pt-4">
                            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                                First Divergence (within 7 days)
                            </h4>
                            {comparison.divergence ? (
                                <div className="flex flex-col md:flex-row md:items-center gap-2 text-sm">
                                    <span className="text-slate-200 font-mono">
                                        {formatTime(new Date(comparison.divergence.ms), tz)}
                                    </span>
                                    <span className="text-slate-500 text-xs">
                                        ({formatRelative(comparison.divergence.ms)})
                                    </span>
                                    <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                            comparison.divergence.who === 'A only'
                                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        }`}
                                    >
                                        {comparison.divergence.who}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-sm text-slate-500 italic">
                                    Both expressions fire at the exact same times in the next 7 days.
                                </div>
                            )}
                        </div>

                        {/* Timeline */}
                        <div className="border-t border-slate-800 pt-4">
                            <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                                Timeline (next 24h)
                            </h4>
                            <Timeline aRuns={dataA.runs} bRuns={dataB.runs} tz={tz} hours={24} />
                        </div>

                        {/* Copy */}
                        <div className="border-t border-slate-800 pt-4 flex justify-end">
                            <Button
                                variant="secondary"
                                onClick={copyComparison}
                                disabled={!comparison}
                                icon={copied ? Check : Copy}
                            >
                                {copied ? 'Copied!' : 'Copy Summary'}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 text-xs text-slate-500 space-y-2">
                <p>
                    <strong className="text-slate-400">Notes:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-1">
                    <li>Two crontabs are <strong className="text-slate-300">equivalent</strong> when they fire at the exact same times — overlap count equals each side's count.</li>
                    <li><strong className="text-slate-300">First divergence</strong> is the earliest timestamp within 7 days where one schedule fires and the other doesn't. Useful when migrating cron jobs.</li>
                    <li>Timezone matters. <code className="text-blue-400">0 9 * * *</code> at UTC is different from the same expression in <code className="text-blue-400">Asia/Singapore</code>.</li>
                    <li>Both expressions must be valid standard 5-field cron. <code className="text-blue-400">@yearly</code> and 6-field expressions are not supported here.</li>
                </ul>
            </div>
        </div>
    );
};

const Stat = ({ label, value, color = 'slate' }) => {
    const colorMap = {
        blue: 'text-blue-300',
        amber: 'text-amber-300',
        green: 'text-green-300',
        slate: 'text-slate-200'
    };
    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`text-2xl font-bold font-mono mt-1 ${colorMap[color]}`}>{value}</div>
        </div>
    );
};

export default CrontabDiff;
