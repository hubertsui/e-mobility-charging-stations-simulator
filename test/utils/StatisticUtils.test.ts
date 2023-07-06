import { expect } from 'expect';

import { median, nthPercentile, stdDeviation } from '../../src/utils/StatisticUtils';

describe('StatisticUtils test suite', () => {
  it('Verify median()', () => {
    expect(median([])).toBe(0);
    expect(median([0.08])).toBe(0.08);
    expect(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(3.05);
    expect(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02])).toBe(2.535);
  });

  it('Verify nthPercentile()', () => {
    expect(nthPercentile([], 25)).toBe(0);
    expect(nthPercentile([0.08], 50)).toBe(0.08);
    const array0 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03];
    expect(nthPercentile(array0, 0)).toBe(0.25);
    expect(nthPercentile(array0, 50)).toBe(3.05);
    expect(nthPercentile(array0, 80)).toBe(4.974);
    expect(nthPercentile(array0, 85)).toBe(5.131);
    expect(nthPercentile(array0, 90)).toBe(5.434);
    expect(nthPercentile(array0, 95)).toBe(5.736999999999999);
    expect(nthPercentile(array0, 100)).toBe(6.04);
  });

  it('Verify stdDeviation()', () => {
    expect(stdDeviation([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(2.0256064851429216);
  });
});
