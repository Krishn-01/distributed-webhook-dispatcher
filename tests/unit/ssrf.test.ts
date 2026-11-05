import { isPrivateOrReservedIPv4, isPrivateOrReservedIPv6, validateDestinationUrl } from '../../src/utils/ssrf';
import { SecurityError } from '../../src/utils/app-error';

describe('SSRF Protection & IP Validation', () => {
  describe('isPrivateOrReservedIPv4', () => {
    it('should detect loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.255.255.254')).toBe(true);
    });

    it('should detect RFC 1918 private subnets', () => {
      expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('10.254.12.3')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.100.200')).toBe(true);
    });

    it('should detect AWS/GCP/Azure cloud metadata IP (169.254.169.254) and link-local', () => {
      expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
    });

    it('should detect broadcast and 0.0.0.0', () => {
      expect(isPrivateOrReservedIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIPv4('255.255.255.255')).toBe(true);
    });

    it('should allow legitimate public IPv4 addresses', () => {
      expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIPv4('93.184.216.34')).toBe(false);
    });
  });

  describe('isPrivateOrReservedIPv6', () => {
    it('should detect IPv6 loopback (::1)', () => {
      expect(isPrivateOrReservedIPv6('::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('::')).toBe(true);
    });

    it('should detect IPv6 link-local and unique local addresses', () => {
      expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fd12:3456:789a::1')).toBe(true);
    });
  });

  describe('validateDestinationUrl', () => {
    it('should reject non-HTTP/HTTPS schemes', async () => {
      await expect(validateDestinationUrl('ftp://example.com/file')).rejects.toThrow(SecurityError);
      await expect(validateDestinationUrl('file:///etc/passwd')).rejects.toThrow(SecurityError);
      await expect(validateDestinationUrl('gopher://example.com')).rejects.toThrow(SecurityError);
    });

    it('should reject cloud metadata hostnames directly', async () => {
      await expect(validateDestinationUrl('http://metadata.google.internal/computeMetadata/v1/')).rejects.toThrow(
        SecurityError
      );
    });

    it('should reject private IP hostnames directly without needing DNS', async () => {
      await expect(validateDestinationUrl('http://127.0.0.1:8080/hook')).rejects.toThrow(SecurityError);
      await expect(validateDestinationUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(SecurityError);
      await expect(validateDestinationUrl('http://10.0.0.5/api')).rejects.toThrow(SecurityError);
    });

    it('should allow private hosts when allowPrivate flag is enabled', async () => {
      const res = await validateDestinationUrl('http://127.0.0.1:3000/mock/ok', true, true);
      expect(res.hostname).toBe('127.0.0.1');
      expect(res.ip).toBe('127.0.0.1');
      expect(res.family).toBe(4);
    });
  });
});
