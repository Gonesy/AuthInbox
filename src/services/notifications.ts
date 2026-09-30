import type { Env } from '../types';

export interface NotificationSettings {
	barkEnabled: boolean;
	barkUrl: string;
	barkTokens: string;
	ntfyEnabled: boolean;
	ntfyUrl: string;
	ntfyTopic: string;
	ntfyToken: string;
}

export interface DeliveryResult {
	ok: boolean;
	status?: number;
	statusText?: string;
	response?: string;
}

function enabled(value?: string): boolean {
	return value?.toLowerCase() === 'true';
}

function normalizeBaseUrl(value: string, fallback: string): string {
	return (value || fallback).replace(/\/+$/, '');
}

function envFallback(env: Env): NotificationSettings {
	return {
		barkEnabled: enabled(env.UseBark),
		barkUrl: normalizeBaseUrl(env.barkUrl || '', 'https://api.day.app'),
		barkTokens: env.barkTokens || '',
		ntfyEnabled: enabled(env.UseNtfy),
		ntfyUrl: normalizeBaseUrl(env.ntfyUrl || '', 'https://ntfy.sh'),
		ntfyTopic: env.ntfyTopic || '',
		ntfyToken: env.ntfyToken || '',
	};
}

export async function getNotificationSettings(env: Env): Promise<NotificationSettings> {
	const fallback = envFallback(env);
	try {
		const row = await env.DB.prepare(
			`SELECT bark_enabled AS barkEnabled, bark_url AS barkUrl, bark_tokens AS barkTokens,
              ntfy_enabled AS ntfyEnabled, ntfy_url AS ntfyUrl, ntfy_topic AS ntfyTopic,
              ntfy_token AS ntfyToken
       FROM notification_settings WHERE id = 1`,
		).first<Record<string, unknown>>();

		if (!row) return fallback;
		return {
			barkEnabled: Number(row.barkEnabled) === 1,
			barkUrl: normalizeBaseUrl(String(row.barkUrl || fallback.barkUrl), fallback.barkUrl),
			barkTokens: String(row.barkTokens || ''),
			ntfyEnabled: Number(row.ntfyEnabled) === 1,
			ntfyUrl: normalizeBaseUrl(String(row.ntfyUrl || fallback.ntfyUrl), fallback.ntfyUrl),
			ntfyTopic: String(row.ntfyTopic || ''),
			ntfyToken: String(row.ntfyToken || ''),
		};
	} catch (error) {
		console.warn('Notification settings table unavailable; using Worker variables', error);
		return fallback;
	}
}

function parseBarkTokens(value: string): string[] {
	return value.replace(/^\[|\]$/g, '').split(',').map((token) => token.trim().replace(/^['\"]|['\"]$/g, '')).filter(Boolean);
}

async function responseText(response: Response): Promise<string | undefined> {
	const text = await response.text().catch(() => '');
	return text ? text.slice(0, 1000) : undefined;
}

export async function deliverBark(settings: NotificationSettings, title: string, message: string): Promise<DeliveryResult> {
	const tokens = parseBarkTokens(settings.barkTokens);
	if (!tokens.length) return { ok: false, response: 'No Bark device token is configured.' };
	for (const token of tokens) {
		const url = `${settings.barkUrl}/${encodeURIComponent(token)}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
		try {
			const response = await fetch(url, { method: 'GET' });
			if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText, response: await responseText(response) };
		} catch (error) {
			return { ok: false, response: error instanceof Error ? error.message : String(error) };
		}
	}
	return { ok: true };
}

export async function deliverNtfy(settings: NotificationSettings, title: string, message: string): Promise<DeliveryResult> {
	if (!settings.ntfyTopic.trim()) return { ok: false, response: 'No ntfy topic is configured.' };
	const headers: Record<string, string> = { Title: title, Priority: 'high', 'Content-Type': 'text/plain; charset=utf-8' };
	if (settings.ntfyToken.trim()) headers.Authorization = `Bearer ${settings.ntfyToken.trim()}`;
	try {
		const response = await fetch(`${settings.ntfyUrl}/${encodeURIComponent(settings.ntfyTopic.trim())}`, { method: 'POST', headers, body: message });
		const body = await responseText(response);
		return response.ok
			? { ok: true, status: response.status, statusText: response.statusText, response: body }
			: { ok: false, status: response.status, statusText: response.statusText, response: body };
	} catch (error) {
		return { ok: false, response: error instanceof Error ? error.message : String(error) };
	}
}

export async function testNotificationChannel(env: Env, channel: 'bark' | 'ntfy'): Promise<DeliveryResult> {
	const settings = await getNotificationSettings(env);
	const title = 'AuthInbox test';
	const message = 'Test notification from AuthInbox';
	return channel === 'bark' ? deliverBark(settings, title, message) : deliverNtfy(settings, title, message);
}

export async function sendNotifications(env: Env, title: string, message: string): Promise<void> {
	const settings = await getNotificationSettings(env);
	const jobs: Array<Promise<DeliveryResult>> = [];
	if (settings.barkEnabled && parseBarkTokens(settings.barkTokens).length > 0) jobs.push(deliverBark(settings, title, message));
	if (settings.ntfyEnabled) jobs.push(deliverNtfy(settings, title, message));
	const results = await Promise.allSettled(jobs);
	for (const result of results) {
		if (result.status === 'rejected') console.error('Notification delivery failed:', result.reason);
		else if (!result.value.ok) console.error('Notification delivery failed:', result.value);
	}
}
