const { parseCookiesWithLastValue } = require('~/server/utils/cookies');

describe('parseCookiesWithLastValue', () => {
  test('should return empty object for empty input', () => {
    expect(parseCookiesWithLastValue()).toEqual({});
    expect(parseCookiesWithLastValue('')).toEqual({});
  });

  test('should parse regular cookie header', () => {
    const parsed = parseCookiesWithLastValue('token_provider=librechat; refreshToken=abc123');
    expect(parsed).toEqual({
      token_provider: 'librechat',
      refreshToken: 'abc123',
    });
  });

  test('should prefer the last duplicate cookie value', () => {
    const parsed = parseCookiesWithLastValue(
      'refreshToken=old-value; token_provider=librechat; refreshToken=new-value',
    );

    expect(parsed.refreshToken).toBe('new-value');
    expect(parsed.token_provider).toBe('librechat');
  });

  test('should decode cookie values using cookie parser behavior', () => {
    const parsed = parseCookiesWithLastValue('name=John%20Doe');
    expect(parsed.name).toBe('John Doe');
  });

  test('should ignore malformed segments safely', () => {
    const parsed = parseCookiesWithLastValue('justtext; keyonly=; =value; valid=ok');
    expect(parsed.valid).toBe('ok');
    expect(parsed.justtext).toBeUndefined();
  });
});
