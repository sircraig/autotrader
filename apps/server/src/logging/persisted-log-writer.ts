import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

import type { PersistedLogEvent } from '@btc-tui/core/models';
import { persistedLogEventSchema } from '@btc-tui/core/validation/logs';

export interface PersistedLogWriterOptions {
  logDir?: string;
}

function getLogDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function getLogFilename(event: PersistedLogEvent): string {
  const date = getLogDate(event.timestamp);

  switch (event.event_type) {
    case 'TRADE_OPEN':
    case 'TRADE_CLOSE':
      return `signals_${date}.jsonl`;
    case 'CANDLE_CLOSE_1M':
      return `candles_1m_${date}.jsonl`;
    case 'CANDLE_CLOSE_5M':
      return `candles_5m_${date}.jsonl`;
    case 'POINT_TRADE_OPEN':
    case 'POINT_TRADE_CLOSE':
      return `point_signals_${date}.jsonl`;
  }
}

export class PersistedLogWriter {
  private readonly logDir: string;

  constructor(options: PersistedLogWriterOptions = {}) {
    this.logDir = options.logDir ?? path.join(process.cwd(), 'logs');
  }

  async write(event: PersistedLogEvent): Promise<string> {
    const validated = persistedLogEventSchema.parse(event) as PersistedLogEvent;
    const filename = getLogFilename(validated);
    const filePath = path.join(this.logDir, filename);

    await mkdir(this.logDir, { recursive: true });
    await appendFile(filePath, `${JSON.stringify(validated)}\n`, 'utf8');

    return filePath;
  }

  async writeMany(events: PersistedLogEvent[]): Promise<string[]> {
    const filePaths: string[] = [];

    for (const event of events) {
      filePaths.push(await this.write(event));
    }

    return filePaths;
  }
}
