import { useState, useEffect, useMemo } from 'react';
import { Copy, Check, KeyRound } from 'lucide-react';
import { Button, Card } from '../components/ui';

/* ============================================================
 * Pure helpers — Unix file permission math
 * ============================================================ */

const PERM_BITS = [
    { name: 'read',    value: 4, char: 'r', flag: 'r' },
    { name: 'write',   value: 2, char: 'w', flag: 'w' },
    { name: 'execute', value: 1, char: 'x', flag: 'x' }
];

const CLASSES = [
    { id: 'user',    label: 'User (owner)',  short: 'u' },
    { id: 'group',   label: 'Group',          short: 'g' },
    { id: 'others',  label: 'Others',         short: 'o' }
];

const SPECIAL = [
    { id: 'setuid',  label: 'Setuid',  value: 4, desc: 'Execute as file owner (s in user position)' },
    { id: 'setgid',  label: 'Setgid',  value: 2, desc: 'Execute as file group (s in group position)' },
    { id: 'sticky',  label: 'Sticky',  value: 1, desc: 'Restrict deletion in shared dirs (t in others position)' }
];

const SYMBOL_TO_VALUE = { r: 4, w: 2, x: 1, s: 0, t: 0, S: 0, T: 0, '-': 0 };

/**
 * Parse a 3- or 4-digit octal string like "755" or "4755".
 * Returns { special, user, group, others } each 0-7.
 */
const parseOctal = (raw) => {
    if (!/^[0-7]{3,4}$/.test(raw)) throw new Error('Octal must be 3-4 digits in 0-7');
    const padded = raw.padStart(4, '0');
    return {
        special: parseInt(padded[0], 10),
        user:    parseInt(padded[1], 10),
        group:   parseInt(padded[2], 10),
        others:  parseInt(padded[3], 10)
    };
};

const octalFromParts = (parts) =>
    `${parts.special}${parts.user}${parts.group}${parts.others}`;

const classOctalToSymbolic = (n) => {
    return PERM_BITS.map((b) => (n & b.value ? b.char : '-')).join('');
};

const classSymbolicToOctal = (s) => {
    if (s.length !== 3) throw new Error('Class must be 3 chars (rwx)');
    return [0, 1, 2].reduce((acc, i) => acc + (SYMBOL_TO_VALUE[s[i]] || 0), 0);
};

const partsToSymbolic = (parts) => ({
    user:   classOctalToSymbolic(parts.user),
    group:  classOctalToSymbolic(parts.group),
    others: classOctalToSymbolic(parts.others)
});

const partsToBinary = (parts) => ({
    user:   parts.user.toString(2).padStart(3, '0'),
    group:  parts.group.toString(2).padStart(3, '0'),
    others: parts.others.toString(2).padStart(3, '0'),
    special: parts.special.toString(2).padStart(3, '0')
});

/**
 * Parse the first 10 chars of an `ls -l` line, e.g. "-rwxr-xr-x" or "drwxrwxrwx".
 * Handles special chars s/S/t/T at the execute position.
 */
const parseLsL = (raw) => {
    if (typeof raw !== 'string') throw new Error('Input must be a string');
    const s = raw.trim();
    if (s.length < 9) throw new Error('Need at least 9 characters for permissions');

    const perm = s.slice(-9);
    const fileType = s.length >= 10 ? s[0] : '-';

    // Per-position read
    const r = (i) => perm[i];
    const bit = (i) => (r(i) === '-' || r(i) === undefined ? 0 : SYMBOL_TO_VALUE[r(i).toLowerCase()] || 0);
    const present = (i) => r(i) !== '-' && r(i) !== undefined;

    const user  = (bit(0)) | (bit(1)) | (bit(2));
    const group = (bit(3)) | (bit(4)) | (bit(5));
    const others= (bit(6)) | (bit(7)) | (bit(8));

    // Special bits: detect by character at execute position
    let special = 0;
    if (present(2) && r(2).toLowerCase() === 's') special |= 4; // setuid
    if (present(5) && r(5).toLowerCase() === 's') special |= 2; // setgid
    if (present(8) && r(8).toLowerCase() === 't') special |= 1; // sticky

    return { fileType, parts: { special, user, group, others } };
};

const formatLsL = (parts, fileType = '-') => {
    const sym = partsToSymbolic(parts);
    // Special chars s/S/t/T override the execute position only.
    // Lowercase = execute bit is on. Uppercase = execute bit is off.
    const specChar = (clsKey, bit, lower, upper) => {
        if (!(parts.special & bit)) return sym[clsKey][2]; // no special, keep x or -
        return (parts[clsKey] & 1) ? lower : upper;
    };
    const userSym  = sym.user.slice(0, 2)  + specChar('user',  4, 's', 'S');
    const groupSym = sym.group.slice(0, 2) + specChar('group', 2, 's', 'S');
    const otherSym = sym.others.slice(0, 2)+ specChar('others',1, 't', 'T');
    return `${fileType}${userSym}${groupSym}${otherSym}`;
};

/* ============================================================
 * UI
 * ============================================================ */

const ChmodCalculator = () => {
    const [mode, setMode] = useState('octal'); // octal | symbolic | ls
    const [octal, setOctal] = useState('755');
    const [symbolic, setSymbolic] = useState('rwxr-xr-x');
    const [lsInput, setLsInput] = useState('-rwxr-xr-x');
    const [error, setError] = useState('');
    const [useSpecial, setUseSpecial] = useState(false);
    const [specialState, setSpecialState] = useState({ setuid: false, setgid: false, sticky: false });
    const [copied, setCopied] = useState({ octal: false, sym: false, ls: false, chmod: false });

    // The canonical state is the octal value. Everything else derives from it.
    // We parse the active input to update octal.
    const parts = useMemo(() => {
        try {
            return { ok: true, data: parseOctal(octal), error: null };
        } catch (e) {
            return { ok: false, data: null, error: e.message };
        }
    }, [octal]);

    // Live octal: reflects manual edits + checkbox overrides
    useEffect(() => {
        // When in symbolic mode and symbolic changes, sync to octal
        if (mode !== 'symbolic') return;
        try {
            const clean = symbolic.replace(/[^rwx-]/g, '');
            if (clean.length !== 9) {
                setError('Symbolic must be 9 characters (rwxrwxrwx)');
                return;
            }
            const user  = classSymbolicToOctal(clean.slice(0, 3));
            const group = classSymbolicToOctal(clean.slice(3, 6));
            const others= classSymbolicToOctal(clean.slice(6, 9));
            // Preserve the leading special digit
            const current = parseOctal(octal);
            const newOctal = octalFromParts({ ...current, user, group, others });
            setOctal(newOctal);
            setError('');
        } catch (e) {
            setError(e.message);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbolic, mode]);

    useEffect(() => {
        if (mode !== 'ls') return;
        try {
            const parsed = parseLsL(lsInput);
            setOctal(octalFromParts(parsed.parts));
            setError('');
        } catch (e) {
            setError(e.message);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lsInput, mode]);

    useEffect(() => {
        if (mode !== 'octal') return;
        setError(parts.ok ? '' : (parts.error || 'Invalid octal'));
    }, [parts, mode]);

    // Sync special-bit checkboxes to the special digit (and vice-versa)
    useEffect(() => {
        if (!parts.ok) return;
        setSpecialState({
            setuid: !!(parts.data.special & 4),
            setgid: !!(parts.data.special & 2),
            sticky: !!(parts.data.special & 1)
        });
    }, [parts]);

    const toggleBit = (clsId, bitValue) => {
        if (!parts.ok) return;
        const newVal = (parts.data[clsId] + bitValue) % 8;
        // Use XOR logic for explicit toggle
        const toggled = parts.data[clsId] ^ bitValue;
        setOctal(octalFromParts({ ...parts.data, [clsId]: toggled }));
    };

    const toggleSpecial = (key) => {
        if (!parts.ok) return;
        const bit = SPECIAL.find((s) => s.id === key).value;
        const next = parts.data.special ^ bit;
        setOctal(octalFromParts({ ...parts.data, special: next }));
    };

    const copyValue = async (val, key) => {
        await navigator.clipboard.writeText(val);
        setCopied((c) => ({ ...c, [key]: true }));
        setTimeout(() => setCopied((c) => ({ ...c, [key]: false })), 1500);
    };

    const safeOctal = parts.ok ? octal : '----';
    const safeSym = parts.ok ? formatLsL(parts.data) : '---------';
    const safeChmod = parts.ok ? `chmod ${safeOctal} path/to/file` : 'chmod --- path/to/file';

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <KeyRound className="text-blue-400" size={24} />
                    Chmod Calculator
                </h2>
            </div>

            {/* Mode tabs */}
            <div className="flex flex-wrap gap-2">
                {[
                    { id: 'octal', label: 'Octal' },
                    { id: 'symbolic', label: 'Symbolic (rwxr-xr-x)' },
                    { id: 'ls', label: 'ls -l parse' }
                ].map((m) => (
                    <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                            mode === m.id
                                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                : 'border-slate-700 bg-slate-900/30 text-slate-300 hover:bg-slate-800'
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <Card title="Input">
                <div className="flex flex-col gap-4">
                    {mode === 'octal' && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                Octal mode (3 or 4 digits, 0-7)
                            </label>
                            <input
                                type="text"
                                value={octal}
                                onChange={(e) => setOctal(e.target.value.replace(/[^0-7]/g, ''))}
                                placeholder="755"
                                className={`bg-slate-900 border rounded-lg px-4 py-3 text-2xl font-mono outline-none focus:ring-1 transition-all ${
                                    parts.ok
                                        ? 'border-slate-700 text-slate-200 focus:border-blue-500 focus:ring-blue-500/50'
                                        : 'border-red-700/60 text-red-300 focus:border-red-500 focus:ring-red-500/40'
                                }`}
                            />
                        </div>
                    )}

                    {mode === 'symbolic' && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                Symbolic mode (9 chars, e.g. rwxr-xr-x)
                            </label>
                            <input
                                type="text"
                                value={symbolic}
                                onChange={(e) => setSymbolic(e.target.value.toLowerCase().replace(/[^rwx-]/g, ''))}
                                placeholder="rwxr-xr-x"
                                maxLength={9}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-2xl font-mono text-slate-200 focus:border-blue-500 outline-none"
                            />
                        </div>
                    )}

                    {mode === 'ls' && (
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                ls -l output (first 10 chars)
                            </label>
                            <input
                                type="text"
                                value={lsInput}
                                onChange={(e) => setLsInput(e.target.value)}
                                placeholder="-rwxr-xr-x"
                                className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-2xl font-mono text-slate-200 focus:border-blue-500 outline-none"
                            />
                            <span className="text-[11px] text-slate-500">
                                Paste the first 10 characters of an <code className="text-blue-400">ls -l</code> line, e.g. <code className="text-blue-400">-rwxr-xr-x</code> or <code className="text-blue-400">drwxrwxr-x</code>.
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                            ⚠ {error}
                        </div>
                    )}
                </div>
            </Card>

            {/* Visual grid */}
            {parts.ok && (
                <Card title="Permission Matrix">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs uppercase tracking-wider text-slate-500">
                                    <th className="px-2 py-2 text-left">Class</th>
                                    <th className="px-2 py-2 text-center">Read (4)</th>
                                    <th className="px-2 py-2 text-center">Write (2)</th>
                                    <th className="px-2 py-2 text-center">Execute (1)</th>
                                    <th className="px-2 py-2 text-right">Octal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {CLASSES.map((cls) => (
                                    <tr key={cls.id} className="border-t border-slate-800">
                                        <td className="px-2 py-3 text-slate-300">{cls.label}</td>
                                        {PERM_BITS.map((bit) => {
                                            const enabled = !!(parts.data[cls.id] & bit.value);
                                            return (
                                                <td key={bit.name} className="px-2 py-3 text-center">
                                                    <button
                                                        onClick={() => toggleBit(cls.id, bit.value)}
                                                        className={`w-10 h-10 rounded-md border font-mono text-lg transition-all ${
                                                            enabled
                                                                ? 'border-blue-500 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                                                                : 'border-slate-700 bg-slate-900/30 text-slate-600 hover:border-slate-600'
                                                        }`}
                                                        aria-label={`Toggle ${bit.name} for ${cls.id}`}
                                                    >
                                                        {bit.flag}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-3 text-right font-mono text-slate-200">{parts.data[cls.id]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Special bits */}
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Special Bits
                            </h4>
                            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useSpecial}
                                    onChange={(e) => {
                                        setUseSpecial(e.target.checked);
                                        if (!e.target.checked && parts.data.special !== 0) {
                                            setOctal(octalFromParts({ ...parts.data, special: 0 }));
                                        }
                                    }}
                                    className="rounded border-slate-600 bg-slate-800 text-blue-500"
                                />
                                Show 4-digit octal
                            </label>
                        </div>
                        {useSpecial && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {SPECIAL.map((s) => {
                                    const enabled = !!(parts.data.special & s.value);
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => toggleSpecial(s.id)}
                                            className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                                                enabled
                                                    ? 'border-amber-500 bg-amber-500/10'
                                                    : 'border-slate-800 bg-slate-900/30 hover:bg-slate-800'
                                            }`}
                                        >
                                            <span className={`text-sm font-medium ${enabled ? 'text-amber-300' : 'text-slate-200'}`}>
                                                {s.label} ({s.value})
                                            </span>
                                            <span className="text-[11px] text-slate-500">{s.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Outputs */}
            {parts.ok && (
                <Card title="All Formats">
                    <div className="flex flex-col gap-3">
                        <FormatRow
                            label="Octal"
                            value={safeOctal}
                            mono
                            onCopy={() => copyValue(safeOctal, 'octal')}
                            copied={copied.octal}
                        />
                        <FormatRow
                            label="Symbolic"
                            value={safeSym}
                            mono
                            onCopy={() => copyValue(safeSym, 'sym')}
                            copied={copied.sym}
                        />
                        <FormatRow
                            label="Binary (per class)"
                            value={`${partsToBinary(parts.data).special} ${partsToBinary(parts.data).user} ${partsToBinary(parts.data).group} ${partsToBinary(parts.data).others}`}
                            mono
                            onCopy={() => copyValue(partsToBinary(parts.data).user + partsToBinary(parts.data).group + partsToBinary(parts.data).others, 'bin')}
                            copied={copied.bin}
                        />
                        <FormatRow
                            label="chmod command"
                            value={safeChmod}
                            mono
                            onCopy={() => copyValue(safeChmod, 'chmod')}
                            copied={copied.chmod}
                        />
                    </div>
                </Card>
            )}

            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 text-xs text-slate-500 space-y-2">
                <p>
                    <strong className="text-slate-400">Reference:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-1">
                    <li><strong className="text-slate-300">Octal:</strong> 3 or 4 digits. Special (setuid/setgid/sticky) | User | Group | Others. Each digit: r=4 + w=2 + x=1.</li>
                    <li><strong className="text-slate-300">Symbolic:</strong> 9 characters in 3 groups of 3 (rwx). <code className="text-blue-400">-</code> means the bit is off.</li>
                    <li><strong className="text-slate-300">Special bits:</strong> <code className="text-blue-400">s/S</code> replace user/group x, <code className="text-blue-400">t/T</code> replaces others x. Uppercase = execute bit is off.</li>
                    <li><strong className="text-slate-300">Common modes:</strong> 644 (rw-r--r--), 755 (rwxr-xr-x), 600 (rw-------), 700 (rwx------), 777 (avoid).</li>
                </ul>
            </div>
        </div>
    );
};

const FormatRow = ({ label, value, onCopy, copied, mono }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800">
        <span className="text-xs uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <span className={`truncate ${mono ? 'font-mono' : ''} text-sm text-slate-200`} title={value}>
                {value}
            </span>
            <Button
                variant="secondary"
                onClick={onCopy}
                icon={copied ? Check : Copy}
            />
        </div>
    </div>
);

export default ChmodCalculator;
