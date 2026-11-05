import dns from 'dns/promises';
import net from 'net';
import { SecurityError } from './app-error';
import { env } from '../config/env';

export interface ValidatedDestination {
  ip: string;
  hostname: string;
  family: 4 | 6;
}

/**
 * Checks whether an IPv4 address belongs to a reserved, private, loopback, or metadata subnet.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed is unsafe
  }

  const [b0, b1, b2, b3] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 10.0.0.0/8 (RFC 1918 Private)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (RFC 1918 Private)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && b2 === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && b2 === 2) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved for future use) & 255.255.255.255 (Broadcast)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is private, loopback, or reserved.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Link-local: fe80::/10
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  // Unique local address: fc00::/7 (fc00:: and fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
  if (normalized.includes('::ffff:')) {
    const ipv4Part = normalized.split('::ffff:')[1];
    if (ipv4Part && isPrivateOrReservedIPv4(ipv4Part)) {
      return true;
    }
  }
  return false;
}

export function isPrivateOrReservedIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isPrivateOrReservedIPv6(ip);
  }
  return isPrivateOrReservedIPv4(ip);
}

/**
 * Checks if a hostname matches the configured SELF_BASE_URL.
 */
function isSelfHost(hostname: string): boolean {
  if (!env.SELF_BASE_URL) return false;
  try {
    const parsedSelf = new URL(env.SELF_BASE_URL);
    return parsedSelf.hostname.toLowerCase() === hostname.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Validates destination URL for SSRF protection by resolving DNS and ensuring
 * the resolved IP address is not private, loopback, link-local, or cloud metadata.
 * Returns validated IP and family for DNS pinning.
 */
export async function validateDestinationUrl(
  urlStr: string,
  enabled = true,
  allowPrivate = env.ALLOW_PRIVATE_HOSTS
): Promise<ValidatedDestination> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SecurityError(`Invalid destination URL: ${urlStr}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityError(`Unsupported protocol "${parsed.protocol}". Only http: and https: are permitted.`);
  }

  const hostname = parsed.hostname;

  // Direct check for metadata hostnames
  if (hostname.toLowerCase() === 'metadata.google.internal' || hostname.toLowerCase() === 'instance-data') {
    throw new SecurityError(`Access to cloud metadata hostnames is forbidden.`);
  }

  const isSelf = isSelfHost(hostname);
  const isIp = net.isIP(hostname);

  // If hostname is already a raw IP literal (IPv4 or IPv6)
  if (isIp !== 0) {
    if (enabled && isPrivateOrReservedIP(hostname)) {
      if (!allowPrivate && !isSelf) {
        throw new SecurityError(`Access to private or reserved IP address "${hostname}" is forbidden.`);
      }
    }
    return {
      ip: hostname,
      hostname,
      family: (isIp === 6 ? 6 : 4) as 4 | 6,
    };
  }

  // Resolve DNS for hostname
  let lookup: Array<{ address: string; family: number }>;
  try {
    lookup = await dns.lookup(hostname, { all: true });
  } catch (err) {
    if (!enabled) {
      return { ip: '127.0.0.1', hostname, family: 4 };
    }
    throw new SecurityError(`Unable to resolve destination hostname "${hostname}": ${(err as Error).message}`);
  }

  if (!lookup || lookup.length === 0 || !lookup[0]?.address) {
    throw new SecurityError(`Unable to resolve destination hostname "${hostname}".`);
  }

  // Enforce private/reserved IP restrictions in production
  if (enabled && !allowPrivate && !isSelf) {
    for (const record of lookup) {
      if (isPrivateOrReservedIP(record.address)) {
        throw new SecurityError(`Destination host "${hostname}" resolves to restricted IP "${record.address}".`);
      }
    }
  }

  const first = lookup[0];
  const ipFamily = net.isIP(first.address);
  if (ipFamily === 0) {
    throw new SecurityError(`Resolved IP address "${first.address}" for host "${hostname}" is invalid.`);
  }

  return {
    ip: first.address,
    hostname,
    family: (first.family === 6 || ipFamily === 6 ? 6 : 4) as 4 | 6,
  };
}
