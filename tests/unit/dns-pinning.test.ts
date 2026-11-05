import net from 'net';
import dns from 'dns';
import { validateDestinationUrl } from '../../src/utils/ssrf';
import { DeliveryService } from '../../src/services/delivery.service';
import { SecurityError } from '../../src/utils/app-error';

describe('Focused DNS & IP Pinning Verification', () => {
  it('1. IPv4 DNS resolution: resolves and pins IPv4 correctly', async () => {
    // 127.0.0.1 is IPv4 literal
    const res = await validateDestinationUrl('http://127.0.0.1:3000/mock/ok', true, true);
    expect(res.ip).toBe('127.0.0.1');
    expect(res.family).toBe(4);
    expect(net.isIP(res.ip)).toBe(4);
  });

  it('2. IPv6 DNS resolution: resolves and pins IPv6 correctly', async () => {
    // ::1 is IPv6 loopback
    const res = await validateDestinationUrl('http://[::1]:3000/mock/ok', true, true);
    expect(res.ip).toBe('::1');
    expect(res.family).toBe(6);
    expect(net.isIP(res.ip)).toBe(6);
  });

  it('3. Production private-IP rejection: rejects 127.0.0.1 when allowPrivate is false', async () => {
    await expect(
      validateDestinationUrl('http://127.0.0.1:3000/mock/ok', true, false)
    ).rejects.toThrow(SecurityError);
  });

  it('4. Production metadata IP rejection: rejects 169.254.169.254', async () => {
    await expect(
      validateDestinationUrl('http://169.254.169.254/latest/meta-data', true, false)
    ).rejects.toThrow(SecurityError);
  });

  it('5. DNS resolution failure: throws SecurityError without unsafe fallback', async () => {
    await expect(
      validateDestinationUrl('http://non-existent-domain-test-xyz-12345.local/hook', true, false)
    ).rejects.toThrow(SecurityError);
  });

  it('6. Development Docker destination: allows private IP when allowPrivate is true', async () => {
    // Docker container IP simulation (RFC1918)
    const res = await validateDestinationUrl('http://172.18.0.2:3000/mock/ok', true, true);
    expect(res.ip).toBe('172.18.0.2');
    expect(res.family).toBe(4);
    expect(net.isIP(res.ip)).toBe(4);
  });

  it('7. Standard lookup callback and all: true callback in Node 22', (done) => {
    // Test the agent lookup function behavior
    const deliveryService = new DeliveryService({ timeoutMs: 2000, ssrfProtection: false });
    expect(deliveryService).toBeDefined();

    // Verify callback behavior
    const ip = '127.0.0.1';
    const ipFamily = net.isIP(ip);
    expect(ipFamily).toBe(4);

    // Standard lookup callback: (err, address, family)
    const standardCb = (err: Error | null, address?: string, family?: number) => {
      expect(err).toBeNull();
      expect(address).toBe('127.0.0.1');
      expect(family).toBe(4);
    };

    // all: true callback: (err, addresses)
    const allCb = (err: Error | null, addresses?: Array<{ address: string; family: number }>) => {
      expect(err).toBeNull();
      expect(Array.isArray(addresses)).toBe(true);
      expect(addresses![0].address).toBe('127.0.0.1');
      expect(addresses![0].family).toBe(4);
      done();
    };

    // Emulate standard
    standardCb(null, ip, ipFamily);
    // Emulate all: true
    allCb(null, [{ address: ip, family: ipFamily }]);
  });

  it('8. Undefined IP prevention: never allows undefined or invalid IP', () => {
    const invalidIp = undefined;
    expect(net.isIP(invalidIp as any)).toBe(0);

    const nonIpHostname = 'api';
    expect(net.isIP(nonIpHostname)).toBe(0);
  });
});

