import { useState, useEffect, useMemo, useCallback } from 'react';
import { Copy, Check, Fingerprint, RefreshCw, Hash, Layers } from 'lucide-react';
import { Button, Card } from '../components/ui';

/* ============================================================
 * Pure helpers — UUID / ULID / NanoID generators
 * All use Web Crypto API (window.crypto.getRandomValues / subtle)
 * No external dependencies.
 * ============================================================ */

const getRandomBytes = (length) => {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
};

const toHex = (bytes, withHyphens = true) => {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!withHyphens) return hex;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const upperHex = (s) => s.toUpperCase();

/* ----- UUID v4 (random) ----- */
const uuidV4 = () => crypto.randomUUID();

/* ----- UUID v1 (timestamp + random node) ----- */
const uuidV1 = () => {
    // 100-ns intervals since UUID epoch (15 Oct 1582)
    const UUID_EPOCH_OFFSET = 0x01b21dd213814000;
    const ts = BigInt(Date.now()) * 10000n + BigInt(UUID_EPOCH_OFFSET);
    const timeLow = Number(ts & 0xffffffffn);
    const timeMid = Number((ts >> 32n) & 0xffffn);
    const timeHi = Number((ts >> 48n) & 0x0fffn) | 0x1000; // version 1

    const rand = getRandomBytes(2);
    const clockSeq = (rand[0] & 0x3f) | 0x80; // variant 10
    const node = getRandomBytes(6);

    const bytes = new Uint8Array(16);
    bytes[0] = (timeLow >>> 24) & 0xff;
    bytes[1] = (timeLow >>> 16) & 0xff;
    bytes[2] = (timeLow >>> 8) & 0xff;
    bytes[3] = timeLow & 0xff;
    bytes[4] = (timeMid >>> 8) & 0xff;
    bytes[5] = timeMid & 0xff;
    bytes[6] = (timeHi >>> 8) & 0xff;
    bytes[7] = timeHi & 0xff;
    bytes[8] = clockSeq;
    bytes[9] = rand[1];
    bytes.set(node, 10);

    return toHex(bytes);
};

/* ----- UUID v5 (namespace + name, SHA-1) ----- */
const NS_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const NS_URL = '6ba7b821-9dad-11d1-80b4-00c04fd430c8';
const NS_OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';
const NS_X500 = '6ba7b814-9dad-11d1-80b4-00c04fd430c8';

const NAMESPACE_OPTIONS = {
    DNS: NS_DNS,
    URL: NS_URL,
    OID: NS_OID,
    X500: NS_X500
};

const uuidFromNamespaceString = (ns) => {
    return ns.replace(/-/g, '').match(/.{2}/g).map((h) => parseInt(h, 16));
};

const uuidV5 = async (name, namespace) => {
    const nsBytes = uuidFromNamespaceString(namespace);
    const nameBytes = new TextEncoder().encode(name);
    const data = new Uint8Array(nsBytes.length + nameBytes.length);
    data.set(nsBytes, 0);
    data.set(nameBytes, nsBytes.length);

    const hashBuf = await crypto.subtle.digest('SHA-1', data);
    const hash = new Uint8Array(hashBuf).slice(0, 16);
    hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
    hash[8] = (hash[8] & 0x3f) | 0x80; // variant 10

    return toHex(hash);
};

/* ----- UUID v7 (timestamp-ordered, RFC 9562) ----- */
const uuidV7 = () => {
    const ts = BigInt(Date.now()); // 48-bit unix ms
    const bytes = getRandomBytes(10);
    const out = new Uint8Array(16);
    out[0] = Number((ts >> 40n) & 0xffn);
    out[1] = Number((ts >> 32n) & 0xffn);
    out[2] = Number((ts >> 24n) & 0xffn);
    out[3] = Number((ts >> 16n) & 0xffn);
    out[4] = Number((ts >> 8n) & 0xffn);
    out[5] = Number(ts & 0xffn);
    out[6] = (bytes[0] & 0x0f) | 0x70; // version 7
    out[7] = bytes[1];
    out[8] = (bytes[2] & 0x3f) | 0x80; // variant 10
    for (let i = 9; i < 16; i++) out[i] = bytes[i - 6];
    return toHex(out);
};

/* ----- ULID (26-char Crockford base32) ----- */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const encodeTime = (time, len) => {
    let out = '';
    for (let i = len - 1; i >= 0; i--) {
        const mod = Number(time % 32n);
        out = CROCKFORD[mod] + out;
        time = time / 32n;
    }
    return out;
};

const encodeRandom = (len) => {
    const bytes = getRandomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) {
        out += CROCKFORD[bytes[i] % 32];
    }
    return out;
};

const ulid = () => {
    const ts = BigInt(Date.now());
    return encodeTime(ts, 10) + encodeRandom(16);
};

/* ----- NanoID (URL-safe) ----- */
const NANO_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

const nanoId = (size = 21) => {
    const bytes = getRandomBytes(size);
    let out = '';
    for (let i = 0; i < size; i++) {
        out += NANO_ALPHABET[bytes[i] % NANO_ALPHABET.length];
    }
    return out;
};

/* ============================================================
 * Generator dispatcher
 * ============================================================ */

const generate = async (type, opts) => {
    switch (type) {
        case 'v1':
            return uuidV1();
        case 'v4':
            return uuidV4();
        case 'v5':
            return await uuidV5(opts.name || 'example.com', NAMESPACE_OPTIONS[opts.namespace] || NS_DNS);
        case 'v7':
            return uuidV7();
        case 'ulid':
            return ulid();
        case 'nanoid':
            return nanoId(opts.size || 21);
        default:
            throw new Error('Unknown generator type');
    }
};

/* ============================================================
 * UI
 * ============================================================ */

const TYPES = [
    { id: 'v4', label: 'UUID v4', desc: 'Random (RFC 4122)' },
    { id: 'v7', label: 'UUID v7', desc: 'Timestamp-ordered (RFC 9562)' },
    { id: 'v1', label: 'UUID v1', desc: 'Timestamp + MAC-like node' },
    { id: 'v5', label: 'UUID v5', desc: 'SHA-1(namespace + name)' },
    { id: 'ulid', label: 'ULID', desc: '26-char, sortable, Crockford' },
    { id: 'nanoid', label: 'Nano ID', desc: 'URL-safe, customizable size' }
];

const UuidGenerator = () => {
    const [type, setType] = useState('v4');
    const [count, setCount] = useState(5);
    const [uppercase, setUppercase] = useState(false);
    const [useHyphens, setUseHyphens] = useState(true);
    const [namespace, setNamespace] = useState('DNS');
    const [customNs, setCustomNs] = useState('');
    const [name, setName] = useState('example.com');
    const [nanoSize, setNanoSize] = useState(21);
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState({ all: false, idx: -1 });

    const activeNamespace = namespace === 'CUSTOM' && customNs ? customNs : NAMESPACE_OPTIONS[namespace];

    const generateAll = useCallback(async () => {
        setError('');
        try {
            const limit = Math.max(1, Math.min(100, parseInt(count, 10) || 1));
            const out = [];
            for (let i = 0; i < limit; i++) {
                let val = await generate(type, {
                    name,
                    namespace,
                    size: nanoSize
                });
                if (type !== 'ulid' && type !== 'nanoid') {
                    if (!useHyphens) val = val.replace(/-/g, '');
                    if (uppercase) val = upperHex(val);
                } else if (type === 'ulid' && uppercase) {
                    val = val.toUpperCase();
                }
                out.push(val);
            }
            setResults(out);
        } catch (e) {
            setError(e.message || String(e));
            setResults([]);
        }
    }, [type, count, uppercase, useHyphens, namespace, customNs, name, nanoSize]);

    // Auto-generate on first load and whenever key inputs change (debounced via dependency).
    useEffect(() => {
        generateAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);

    const copyAll = async () => {
        if (!results.length) return;
        await navigator.clipboard.writeText(results.join('\n'));
        setCopied({ all: true, idx: -1 });
        setTimeout(() => setCopied((c) => ({ ...c, all: false })), 1500);
    };

    const copyOne = async (val, idx) => {
        await navigator.clipboard.writeText(val);
        setCopied({ all: false, idx });
        setTimeout(() => setCopied((c) => ({ ...c, idx: -1 })), 1500);
    };

    const showUuidOptions = type !== 'ulid' && type !== 'nanoid';
    const showHyphenToggle = showUuidOptions;
    const showUppercase = true;
    const showV5Options = type === 'v5';
    const showNanoSize = type === 'nanoid';

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Fingerprint className="text-blue-400" size={24} />
                    UUID / ULID Generator
                </h2>
            </div>

            <Card title="Type">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {TYPES.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setType(t.id)}
                            className={`flex flex-col items-start gap-1 p-3 rounded-lg border transition-all text-left ${
                                type === t.id
                                    ? 'border-blue-500 bg-blue-500/10'
                                    : 'border-slate-800 bg-slate-900/30 hover:bg-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <span className={`text-sm font-medium ${type === t.id ? 'text-blue-300' : 'text-slate-200'}`}>
                                {t.label}
                            </span>
                            <span className="text-[11px] text-slate-500">{t.desc}</span>
                        </button>
                    ))}
                </div>
            </Card>

            <Card title="Options">
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Count */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                Count (1–100)
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                step="1"
                                value={count}
                                onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-200 focus:border-blue-500 outline-none"
                            />
                        </div>

                        {showNanoSize && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                    Nano ID Length
                                </label>
                                <input
                                    type="number"
                                    min="8"
                                    max="64"
                                    step="1"
                                    value={nanoSize}
                                    onChange={(e) => setNanoSize(Math.max(8, Math.min(64, parseInt(e.target.value, 10) || 21)))}
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-200 focus:border-blue-500 outline-none"
                                />
                            </div>
                        )}
                    </div>

                    {showV5Options && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                    Namespace
                                </label>
                                <select
                                    value={namespace}
                                    onChange={(e) => setNamespace(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:border-blue-500 outline-none"
                                >
                                    {Object.keys(NAMESPACE_OPTIONS).map((k) => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                    <option value="CUSTOM">Custom UUID…</option>
                                </select>
                            </div>
                            {namespace === 'CUSTOM' ? (
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                        Custom Namespace UUID
                                    </label>
                                    <input
                                        type="text"
                                        value={customNs}
                                        onChange={(e) => setCustomNs(e.target.value)}
                                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-200 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                        Resolved Namespace
                                    </label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={activeNamespace}
                                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-400"
                                    />
                                </div>
                            )}
                            <div className="flex flex-col gap-2 md:col-span-2">
                                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="example.com"
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-200 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-4 border-t border-slate-800 pt-4">
                        {showUppercase && (
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={uppercase}
                                    onChange={(e) => setUppercase(e.target.checked)}
                                    className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-offset-slate-900"
                                />
                                Uppercase
                            </label>
                        )}
                        {showHyphenToggle && (
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useHyphens}
                                    onChange={(e) => setUseHyphens(e.target.checked)}
                                    className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-offset-slate-900"
                                />
                                Hyphens
                            </label>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button onClick={generateAll} icon={RefreshCw}>
                            Generate
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={copyAll}
                            disabled={!results.length}
                            icon={copied.all ? Check : Copy}
                        >
                            {copied.all ? 'Copied All' : 'Copy All'}
                        </Button>
                    </div>

                    {error && (
                        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                            ⚠ {error}
                        </div>
                    )}
                </div>
            </Card>

            {results.length > 0 && (
                <Card title={`Output (${results.length})`}>
                    <div className="flex flex-col gap-1 font-mono text-sm max-h-[480px] overflow-y-auto">
                        {results.map((val, idx) => (
                            <div
                                key={`${val}-${idx}`}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-slate-900/60 group"
                            >
                                <span className="text-slate-300 truncate" title={val}>
                                    {val}
                                </span>
                                <button
                                    onClick={() => copyOne(val, idx)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-400 shrink-0"
                                    aria-label="Copy"
                                >
                                    {copied.idx === idx ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 text-xs text-slate-500 space-y-2">
                <p>
                    <strong className="text-slate-400">When to use what:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-1">
                    <li><strong className="text-slate-300">UUID v4</strong> — the safe default. Cryptographically random, no information leakage.</li>
                    <li><strong className="text-slate-300">UUID v7</strong> — same entropy as v4 but time-ordered. Better for DB indexes (Postgres, MySQL).</li>
                    <li><strong className="text-slate-300">UUID v1</strong> — leaks timestamp + MAC. Avoid in public-facing systems.</li>
                    <li><strong className="text-slate-300">UUID v5</strong> — deterministic: same namespace+name always yields the same UUID. Good for content-addressed IDs.</li>
                    <li><strong className="text-slate-300">ULID</strong> — 26 chars, lexicographically sortable, more compact than UUID.</li>
                    <li><strong className="text-slate-300">Nano ID</strong> — shortest, URL-safe, ideal for shareable short links.</li>
                </ul>
            </div>
        </div>
    );
};

export default UuidGenerator;
