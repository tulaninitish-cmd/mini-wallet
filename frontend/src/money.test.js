import { describe, expect, test } from 'vitest';
import { parseToMinor, formatMinor } from './money';

describe('parseToMinor', () => {
  test.each([
    ['250', 25000],
    ['250.5', 25050],
    ['250.50', 25050],
    ['0.05', 5],
    ['1,250.75', 125075],
    [' 12 ', 1200],
  ])('%s -> %i', (input, expected) => expect(parseToMinor(input)).toBe(expected));

  test.each([[''], ['abc'], ['0'], ['0.00'], ['-5'], ['1.234'], ['1e3'], ['12.']])('rejects %p', (input) =>
    expect(parseToMinor(input)).toBeNull()
  );

  test('0.1 + 0.2 style float traps do not occur', () => {
    expect(parseToMinor('0.1') + parseToMinor('0.2')).toBe(parseToMinor('0.3'));
  });
});

describe('formatMinor', () => {
  test('formats paise as rupees', () => expect(formatMinor(125075)).toMatch(/1,250\.75/));
});
