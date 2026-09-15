import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverNtfy } from '../src/services/notifications';

describe('ntfy delivery diagnostics', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns the ntfy HTTP error status and response body', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":403,"error":"forbidden"}', {
			status: 403,
			statusText: 'Forbidden',
			headers: { 'content-type': 'application/json' },
		})));

		const result = await deliverNtfy({
			barkEnabled: false,
			barkUrl: 'https://api.day.app',
			barkTokens: '',
			ntfyEnabled: true,
			ntfyUrl: 'https://ntfy.sh',
			ntfyTopic: 'auth-inbox-test',
			ntfyToken: '',
		}, 'AuthInbox test', 'Test notification');

		expect(result).toEqual({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			response: '{"code":403,"error":"forbidden"}',
		});
	});

	it('does not send an Authorization header for an empty token', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"abc"}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await deliverNtfy({
			barkEnabled: false,
			barkUrl: 'https://api.day.app',
			barkTokens: '',
			ntfyEnabled: true,
			ntfyUrl: 'https://ntfy.sh',
			ntfyTopic: 'auth-inbox-test',
			ntfyToken: '',
		}, 'AuthInbox test', 'Test notification');

		const [, init] = fetchMock.mock.calls[0];
		expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
	});
});
