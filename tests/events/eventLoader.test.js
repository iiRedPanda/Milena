import path from 'path';
import fs from 'fs/promises';
import { jest } from '@jest/globals';

const eventsDir = path.resolve('src/events');
const loggerPath = path.resolve('src/services/logger.js');
const analyticsPath = path.resolve('src/services/analytics.js');

const logMock = jest.fn();
const trackErrorMock = jest.fn();

jest.unstable_mockModule(loggerPath, () => ({ default: { log: logMock } }));
jest.unstable_mockModule(analyticsPath, () => ({ default: { trackError: trackErrorMock } }));

async function createEvent(name, content) {
  const file = path.join(eventsDir, name);
  await fs.writeFile(file, content);
  return file;
}

async function removeEvent(name) {
  try { await fs.unlink(path.join(eventsDir, name)); } catch {}
}

describe('loadEvents', () => {
  beforeEach(async () => {
    logMock.mockReset();
    trackErrorMock.mockReset();
    await removeEvent('good.js');
  });

  test('registers events', async () => {
    const file = await createEvent('good.js', "export default { name: 'good', execute() {} };\n");

    const { loadEvents } = await import('../../src/events/eventLoader.js');
    const client = { on: jest.fn(), once: jest.fn() };

    await loadEvents(client);

    expect(client.on).toHaveBeenCalledWith('good', expect.any(Function));

    await removeEvent('good.js');
  });

  test('continues loading when an event fails', async () => {
    await createEvent('good.js', "export default { name: 'good', execute() {} };\n");
    const { loadEvents } = await import('../../src/events/eventLoader.js');
    const client = { on: jest.fn(), once: jest.fn() };

    // fs.readdir will include non-existent bad.js automatically because the file isn't there.
    jest.spyOn(fs, 'readdir').mockResolvedValue(['good.js', 'bad.js']);

    await loadEvents(client);

    expect(client.on).toHaveBeenCalledWith('good', expect.any(Function));
    expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('Failed to load event: bad.js'), expect.any(Object));
    expect(trackErrorMock).toHaveBeenCalled();

    jest.restoreAllMocks();
    await removeEvent('good.js');
  });
});
