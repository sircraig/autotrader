import { expect, test } from 'bun:test';

import { tradingConfig } from './trading';

test('runtime point thresholds reflect the Python config contract', () => {
  expect(tradingConfig.pointSignals.openThreshold).toBe(4);
  expect(tradingConfig.pointSignals.closeThreshold).toBe(2);
});
