import { useState, useMemo } from 'react';
import { Network, Copy, Check, Layers } from 'lucide-react';
import { Button, Card } from '../components/ui';

/* ============================================================
 * Pure helpers — IPv4 CIDR math (no external lib)
 * ============================================================ */

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const ipToInt = (ip) => {
    const p = ip.split('.').map(Number);
    return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
};

const intToIp = (n) => [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff
].join('.');

const intToBinary = (n) =>
    [3, 2, 1, 0]
        .map((i) => ((n >>> (i * 8)) & 0xff).toString(2).padStart(8, '0'))
        .join('.');

/**
 * Parse "a.b.c.d/n". Throws on invalid input.
 */
const parseCidr = (cidr) => {
    if (typeof cidr !== 'string') throw new Error('CIDR must be a string');
    const trimmed = cidr.trim();
    if (!trimmed) throw new Error('Empty CIDR');
    const slashIdx = trimmed.indexOf('/');
    if (slashIdx === -1) throw new Error('Missing /prefix (e.g. 192.168.1.0/24)');
    const ip = trimmed.slice(0, slashIdx);
    const prefixStr = trimmed.slice(slashIdx + 1);
    if (!/^\d+$/.test(prefixStr)) throw new Error('Prefix must be 0-32');
    const prefix = parseInt(prefixStr, 10);
    if (prefix < 0 || prefix > 32) throw new Error('Prefix out of range (0-32)');
    if (!IPV4_REGEX.test(ip)) throw new Error('Invalid IPv4 address');

    const ipInt = ipToInt(ip);
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | ((~mask) >>> 0)) >>> 0;
    const total = prefix === 0 ? 0x100000000 : Math.pow(2, 32 - prefix);
    const usableHosts = prefix >= 31 ? total : Math.max(0, total - 2);
    const firstHost = prefix >= 31 ? network : ((network + 1) >>> 0);
    const lastHost = prefix >= 31 ? broadcast : ((broadcast - 1) >>> 0);
    const wildcard = ((~mask) >>> 0);

    return {
        input: trimmed,
        ip: intToIp(ipInt),
        ipInt,
        prefix,
        mask,
        maskIp: intToIp(mask),
        wildcard,
        wildcardIp: intToIp(wildcard),
        network,
        networkIp: intToIp(network),
        broadcast,
        broadcastIp: intToIp(broadcast),
        firstHost,
        firstHostIp: intToIp(firstHost),
        lastHost,
        lastHostIp: intToIp(lastHost),
        total,
        usableHosts
    };
};

/* ----- Classification helpers ----- */

const ipClass = (ipInt) => {
    const first = (ipInt >>> 24) & 0xff;
    if (first <= 126) return 'A';
    if (first === 127) return 'A (loopback)';
    if (first <= 191) return 'B';
    if (first <= 223) return 'C';
    if (first <= 239) return 'D (multicast)';
    return 'E (reserved)';
};

const ipType = (ipInt) => {
    const a = (ipInt >>> 24) & 0xff;
    const b = (ipInt >>> 16) & 0xff;
    if (a === 10) return 'Private (RFC 1918)';
    if (a === 172 && b >= 16 && b <= 31) return 'Private (RFC 1918)';
    if (a === 192 && b === 168) return 'Private (RFC 1918)';
    if (a === 127) return 'Loopback';
    if (a === 169 && b === 254) return 'Link-local (APIPA)';
    if (a === 192 && b === 0 && ((ipInt >>> 8) & 0xff) === 2) return 'Documentation (TEST-NET-1)';
    if (a === 198 && b === 51 && ((ipInt >>> 8) & 0xff) === 100) return 'Documentation (TEST-NET-2)';
    if (a === 203 && b === 0 && ((ipInt >>> 8) & 0xff) === 113) return 'Documentation (TEST-NET-3)';
    if (a === 100 && b >= 64 && b <= 127) return 'CGNAT (RFC 6598)';
    if (a >= 224 && a <= 239) return 'Multicast';
    if (a >= 240) return 'Reserved (Class E)';
    if (a === 255 && ((ipInt >>> 16) & 0xffff) === 0xffff) return 'Broadcast';
    return 'Public';
};

/* ============================================================
 * Subnet Splitter — equal split only
 * ============================================================ */

/**
 * Split a base CIDR into N equal subnets. N must be a power of 2.
 * Returns the subnets in allocation order.
 */
const equalSplit = (cidr, count) => {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error('Count must be a positive integer');
    }
    if ((count & (count - 1)) !== 0) {
        throw new Error('Count must be a power of 2 (1, 2, 4, 8, …)');
    }
    const base = parseCidr(cidr);
    const newPrefix = base.prefix + Math.log2(count);
    if (newPrefix > 32) {
        throw new Error(`Cannot split into ${count} subnets — exceeds /32`);
    }
    const blockSize = Math.pow(2, 32 - newPrefix);
    const out = [];
    for (let i = 0; i < count; i++) {
        const networkInt = (base.network + i * blockSize) >>> 0;
        out.push(parseCidr(`${intToIp(networkInt)}/${newPrefix}`));
    }
    return out;
};

/* ============================================================
 * Reusable UI bits
 * ============================================================ */

const CopyButton = ({ value, label = 'Copy' }) => {
    const [copied, setCopied] = useState(false);
    const handle = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(String(value));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard may be unavailable; no-op */
        }
    };
    return (
        <Button
            variant="secondary"
            onClick={handle}
            disabled={!value}
            icon={copied ? Check : Copy}
        >
            {copied ? 'Copied' : label}
        </Button>
    );
};

const InfoRow = ({ label, value, mono = true, copyable = false }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
        <span className="text-xs uppercase tracking-wider text-slate-500 shrink-0">
            {label}
        </span>
        <div className="flex items-center gap-2 min-w-0">
            <span
                className={`truncate text-right ${mono ? 'font-mono' : ''} text-sm text-slate-200`}
                title={value}
            >
                {value}
            </span>
            {copyable && <CopyButton value={value} />}
        </div>
    </div>
);

const PRESETS = [
    { label: 'Private /24', value: '192.168.1.0/24' },
    { label: 'Private /16', value: '172.16.0.0/16' },
    { label: 'Private /8', value: '10.0.0.0/8' },
    { label: 'Public /27', value: '203.0.113.0/27' },
    { label: 'Point-to-Point /31', value: '10.0.0.0/31' },
    { label: 'Host route /32', value: '192.168.1.10/32' }
];

/* ============================================================
 * Main component
 * ============================================================ */

const SubnetCalculator = () => {
    const [cidr, setCidr] = useState('192.168.1.0/24');
    const [equalCount, setEqualCount] = useState(4);

    const parsed = useMemo(() => {
        try {
            return { ok: true, data: parseCidr(cidr), error: null };
        } catch (e) {
            return { ok: false, data: null, error: e.message };
        }
    }, [cidr]);

    const equalSubnets = useMemo(() => {
        if (!parsed.ok) return { ok: false, error: null, data: [] };
        try {
            return { ok: true, data: equalSplit(cidr, equalCount), error: null };
        } catch (e) {
            return { ok: false, error: e.message, data: [] };
        }
    }, [cidr, equalCount, parsed.ok]);

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Network className="text-blue-400" size={24} />
                    Subnet Calculator
                </h2>
                <p className="text-sm text-slate-400">
                    Parse IPv4 CIDR and split a network into equal-sized subnets. All math runs locally in the browser — nothing is sent to a server.
                </p>
            </div>

            {/* Card 1 — CIDR + Network Info */}
            <Card title="IPv4 CIDR">
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                            CIDR
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={cidr}
                                onChange={(e) => setCidr(e.target.value)}
                                placeholder="192.168.1.0/24"
                                className={`flex-1 bg-slate-900 border rounded-lg px-4 py-3 text-base md:text-lg font-mono outline-none focus:ring-1 transition-all ${
                                    parsed.ok
                                        ? 'border-slate-700 text-slate-200 focus:border-blue-500 focus:ring-blue-500/50'
                                        : 'border-red-700/60 text-red-300 focus:border-red-500 focus:ring-red-500/40'
                                }`}
                            />
                            <CopyButton value={cidr} label="Copy" />
                        </div>
                        {parsed.error && (
                            <span className="text-xs text-red-400">⚠ {parsed.error}</span>
                        )}
                    </div>

                    {/* Presets */}
                    <div>
                        <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                            Quick Presets
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {PRESETS.map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => setCidr(p.value)}
                                    className="px-3 py-1.5 text-xs font-mono rounded-md border border-slate-700 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-600 text-slate-300 transition-colors"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {parsed.ok && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                                    Addresses
                                </h4>
                                <InfoRow label="Network" value={parsed.data.networkIp} copyable />
                                <InfoRow label="Broadcast" value={parsed.data.broadcastIp} copyable />
                                <InfoRow
                                    label="First Host"
                                    value={parsed.data.prefix >= 31 ? 'N/A' : parsed.data.firstHostIp}
                                    copyable={parsed.data.prefix < 31}
                                />
                                <InfoRow
                                    label="Last Host"
                                    value={parsed.data.prefix >= 31 ? 'N/A' : parsed.data.lastHostIp}
                                    copyable={parsed.data.prefix < 31}
                                />
                                <InfoRow
                                    label="Total Addresses"
                                    value={parsed.data.total.toLocaleString()}
                                />
                                <InfoRow
                                    label="Usable Hosts"
                                    value={parsed.data.usableHosts.toLocaleString()}
                                />
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                                    Masks & Classification
                                </h4>
                                <InfoRow label="Prefix Length" value={`/${parsed.data.prefix}`} />
                                <InfoRow label="Subnet Mask" value={parsed.data.maskIp} copyable />
                                <InfoRow
                                    label="Wildcard Mask"
                                    value={parsed.data.wildcardIp}
                                    copyable
                                />
                                <InfoRow label="IP Class" value={ipClass(parsed.data.ipInt)} />
                                <InfoRow label="IP Type" value={ipType(parsed.data.ipInt)} />
                                <InfoRow
                                    label="Binary (IP)"
                                    value={intToBinary(parsed.data.ipInt)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Card 2 — Equal Subnet Splitter */}
            <Card title="Subnet Splitter">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                                Number of Subnets (power of 2)
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="1"
                                    max="256"
                                    step="1"
                                    value={equalCount}
                                    onChange={(e) => setEqualCount(parseInt(e.target.value, 10) || 1)}
                                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-200 focus:border-blue-500 outline-none"
                                />
                                <div className="flex flex-wrap gap-1">
                                    {[2, 4, 8, 16, 32, 64].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setEqualCount(n)}
                                            className={`px-2 py-1 text-xs font-mono rounded border ${
                                                equalCount === n
                                                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {!equalSubnets.ok && equalSubnets.error && (
                                <span className="text-xs text-red-400">⚠ {equalSubnets.error}</span>
                            )}
                        </div>
                    </div>

                    {/* Results table */}
                    {equalSubnets.ok && equalSubnets.data.length > 0 && (
                        <div className="border-t border-slate-800 pt-4">
                            <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <Layers size={14} />
                                {equalSubnets.data.length} Equal Subnets
                            </h4>
                            <div className="overflow-x-auto rounded-lg border border-slate-800">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Network</th>
                                            <th className="px-3 py-2 text-left">Broadcast</th>
                                            <th className="px-3 py-2 text-left">Mask</th>
                                            <th className="px-3 py-2 text-right">Hosts</th>
                                            <th className="px-3 py-2 text-right">Range</th>
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono text-xs">
                                        {equalSubnets.data.map((s, i) => (
                                            <tr
                                                key={i}
                                                className="border-t border-slate-800 hover:bg-slate-900/50"
                                            >
                                                <td className="px-3 py-2 text-blue-300">
                                                    {s.networkIp}/{s.prefix}
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">
                                                    {s.broadcastIp}
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">
                                                    {s.maskIp}
                                                </td>
                                                <td className="px-3 py-2 text-right text-green-300">
                                                    {s.usableHosts.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-400">
                                                    {s.prefix >= 31
                                                        ? `${s.firstHostIp}–${s.lastHostIp}`
                                                        : `${s.firstHostIp} – ${s.lastHostIp}`}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default SubnetCalculator;
