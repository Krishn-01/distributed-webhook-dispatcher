import { extractDomain } from '../../src/utils/domain';

describe('Domain Extractor Utility', () => {
  it('should extract lowercase domain from valid HTTP URL', () => {
    expect(extractDomain('http://example.com/webhook')).toBe('example.com');
  });

  it('should extract lowercase domain from HTTPS URL with port and query', () => {
    expect(extractDomain('https://API.Subdomain.Org:8443/v1/events?foo=bar#hash')).toBe('api.subdomain.org');
  });

  it('should handle IPv4 addresses as domain', () => {
    expect(extractDomain('http://93.184.216.34/webhook')).toBe('93.184.216.34');
  });

  it('should throw an error for malformed URLs', () => {
    expect(() => extractDomain('not-a-valid-url')).toThrow('Invalid destination URL');
  });
});

