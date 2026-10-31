import { sma, emaValues, macd, rsi, bollinger } from './indicators';

const mk = (closes) =>
  closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 100,
  }));

describe('sma', () => {
  it('skips warm-up and averages the window', () => {
    const out = sma(mk([1, 2, 3, 4, 5]), 3);
    expect(out.map((p) => p.value)).toEqual([2, 3, 4]);
    expect(out[0].time).toBe('2026-01-03');
  });
});

describe('emaValues', () => {
  it('matches the recursive definition', () => {
    const out = emaValues([10, 11, 12], 3); // k = 0.5
    expect(out).toEqual([10, 10.5, 11.25]);
  });
});

describe('macd', () => {
  it('is zero on a flat series and has 2x histogram convention', () => {
    const { dif, dea, hist } = macd(mk(Array(40).fill(10)));
    expect(dif).toHaveLength(40);
    expect(hist.every((p) => Math.abs(p.value) < 1e-12)).toBe(true);
    expect(dea.every((p) => Math.abs(p.value) < 1e-12)).toBe(true);
  });

  it('hist equals 2*(dif-dea) and is colored by sign', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 10 + Math.sin(i / 3) * 2);
    const { dif, dea, hist } = macd(mk(closes), 12, 26, 9, { up: 'r', down: 'g' });
    hist.forEach((p, i) => {
      expect(p.value).toBeCloseTo(2 * (dif[i].value - dea[i].value), 10);
      expect(p.color).toBe(p.value >= 0 ? 'r' : 'g');
    });
  });
});

describe('rsi', () => {
  it('is 100 on a strictly rising series and 0 on a falling one', () => {
    const up = rsi(mk(Array.from({ length: 20 }, (_, i) => i + 1)), 14);
    expect(up).toHaveLength(6);
    expect(up.every((p) => p.value === 100)).toBe(true);
    const down = rsi(mk(Array.from({ length: 20 }, (_, i) => 20 - i)), 14);
    expect(down.every((p) => p.value === 0)).toBe(true);
  });

  it('stays within [0, 100] and returns empty when too short', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 10 + Math.sin(i) * 3);
    expect(rsi(mk(closes)).every((p) => p.value >= 0 && p.value <= 100)).toBe(true);
    expect(rsi(mk([1, 2, 3]), 14)).toEqual([]);
  });
});

describe('bollinger', () => {
  it('uses sample std (ddof=1) like pandas', () => {
    const { upper, middle, lower } = bollinger(mk([1, 2, 3]), 3, 2);
    expect(middle[0].value).toBe(2);
    expect(upper[0].value).toBeCloseTo(4, 10); // sd = 1
    expect(lower[0].value).toBeCloseTo(0, 10);
  });

  it('collapses onto the mean for a flat series', () => {
    const { upper, lower } = bollinger(mk(Array(25).fill(5)));
    expect(upper).toHaveLength(6);
    expect(upper.every((p, i) => p.value === 5 && lower[i].value === 5)).toBe(true);
  });
});
