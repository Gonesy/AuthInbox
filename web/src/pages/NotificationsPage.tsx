import { useEffect, useState } from 'react';
import { Bell, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getJson, postJson } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NotificationSettings {
	barkEnabled: boolean;
	barkUrl: string;
	barkTokens: string;
	ntfyEnabled: boolean;
	ntfyUrl: string;
	ntfyTopic: string;
	ntfyTokenConfigured: boolean;
}

export function NotificationsPage(): JSX.Element {
	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [ntfyToken, setNtfyToken] = useState('');
	const [clearNtfyToken, setClearNtfyToken] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		getJson<NotificationSettings>('/api/admin/notifications')
			.then(setSettings)
			.catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load notification settings'));
	}, []);

	if (!settings) return <div className="text-sm text-muted-foreground">Loading notification settings…</div>;

	const save = (): void => {
		setSaving(true);
		postJson('/api/admin/notifications', {
			...settings,
			ntfyToken,
			clearNtfyToken,
		})
			.then(() => {
				toast.success('Notification settings saved');
				setSettings((current) => current ? { ...current, ntfyTokenConfigured: clearNtfyToken ? false : Boolean(ntfyToken) || current.ntfyTokenConfigured } : current);
				setNtfyToken('');
				setClearNtfyToken(false);
			})
			.catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to save notification settings'))
			.finally(() => setSaving(false));
	};

	return (
		<div className="space-y-6">
			<div>
				<div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-100"><Bell className="h-4 w-4 text-primary" /> Push Notifications</div>
				<p className="text-xs text-muted-foreground">Bark and ntfy are independent. Enable either one or both to receive extracted verification codes.</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card className="p-6">
					<CardHeader className="p-0 pb-4"><CardTitle>Bark</CardTitle></CardHeader>
					<label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.barkEnabled} onChange={(e) => setSettings({ ...settings, barkEnabled: e.target.checked })} /> Enable Bark</label>
					<div className="space-y-4">
						<div className="space-y-1.5"><Label htmlFor="bark-url">Server URL</Label><Input id="bark-url" value={settings.barkUrl} onChange={(e) => setSettings({ ...settings, barkUrl: e.target.value })} placeholder="https://api.day.app" /></div>
						<div className="space-y-1.5"><Label htmlFor="bark-tokens">Device token(s)</Label><Input id="bark-tokens" value={settings.barkTokens} onChange={(e) => setSettings({ ...settings, barkTokens: e.target.value })} placeholder="token1, token2" /><p className="text-[11px] text-muted-foreground">Separate multiple Bark device tokens with commas.</p></div>
					</div>
				</Card>

				<Card className="p-6">
					<CardHeader className="p-0 pb-4"><CardTitle>ntfy</CardTitle></CardHeader>
					<label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.ntfyEnabled} onChange={(e) => setSettings({ ...settings, ntfyEnabled: e.target.checked })} /> Enable ntfy</label>
					<div className="space-y-4">
						<div className="space-y-1.5"><Label htmlFor="ntfy-url">Server URL</Label><Input id="ntfy-url" value={settings.ntfyUrl} onChange={(e) => setSettings({ ...settings, ntfyUrl: e.target.value })} placeholder="https://ntfy.sh" /></div>
						<div className="space-y-1.5"><Label htmlFor="ntfy-topic">Topic</Label><Input id="ntfy-topic" value={settings.ntfyTopic} onChange={(e) => setSettings({ ...settings, ntfyTopic: e.target.value })} placeholder="auth-inbox-random-topic" /></div>
						<div className="space-y-1.5"><Label htmlFor="ntfy-token">Access token (optional)</Label><Input id="ntfy-token" type="password" autoComplete="new-password" value={ntfyToken} onChange={(e) => { setNtfyToken(e.target.value); setClearNtfyToken(false); }} placeholder={settings.ntfyTokenConfigured ? 'Token configured — leave blank to keep it' : 'tk_…'} /><p className="text-[11px] text-muted-foreground">The stored token is never returned to the browser.</p></div>
					{settings.ntfyTokenConfigured ? <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={clearNtfyToken} onChange={(e) => setClearNtfyToken(e.target.checked)} /> Remove stored ntfy token</label> : null}
					</div>
				</Card>
			</div>

			<div className="flex justify-end"><Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save settings'}</Button></div>
		</div>
	);
}
