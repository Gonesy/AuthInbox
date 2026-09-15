import { useEffect, useState } from 'react';
import { Bell, Save, Send } from 'lucide-react';
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
interface TestResult { channel: 'bark' | 'ntfy'; ok: boolean; status?: number; statusText?: string; response?: string; }

export function NotificationsPage(): JSX.Element {
	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [ntfyToken, setNtfyToken] = useState('');
	const [clearNtfyToken, setClearNtfyToken] = useState(false);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState<'bark' | 'ntfy' | null>(null);
	const [testResult, setTestResult] = useState<TestResult | null>(null);

	useEffect(() => { getJson<NotificationSettings>('/api/admin/notifications').then(setSettings).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load notification settings')); }, []);
	if (!settings) return <div className="text-sm text-muted-foreground">Loading notification settings…</div>;

	const save = (): void => {
		setSaving(true);
		postJson('/api/admin/notifications', { ...settings, ntfyToken, clearNtfyToken })
			.then(() => { toast.success('Notification settings saved'); setSettings((current) => current ? { ...current, ntfyTokenConfigured: clearNtfyToken ? false : Boolean(ntfyToken) || current.ntfyTokenConfigured } : current); setNtfyToken(''); setClearNtfyToken(false); })
			.catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to save notification settings'))
			.finally(() => setSaving(false));
	};
	const test = (channel: 'bark' | 'ntfy'): void => {
		setTesting(channel); setTestResult(null);
		postJson<TestResult>('/api/admin/notifications/test', { channel })
			.then((result) => { setTestResult(result); result.ok ? toast.success(`${channel} test sent`) : toast.error(`${channel} test failed`); })
			.catch((error: unknown) => { const message=error instanceof Error?error.message:'Unable to test notification'; setTestResult({channel,ok:false,response:message}); toast.error(message); })
			.finally(() => setTesting(null));
	};
	const resultBox = (channel: 'bark' | 'ntfy') => testResult?.channel===channel ? <div className={`mt-3 rounded-md border p-3 text-xs ${testResult.ok?'border-emerald-700/60':'border-red-700/60'}`}><div className="font-medium">{testResult.ok?'Sent successfully':'Failed'}{testResult.status?` — HTTP ${testResult.status} ${testResult.statusText||''}`:''}</div>{testResult.response?<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{testResult.response}</pre>:null}</div> : null;

	return <div className="space-y-6">
		<div><div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-100"><Bell className="h-4 w-4 text-primary" /> Push Notifications</div><p className="text-xs text-muted-foreground">Bark and ntfy are independent. Save settings before testing a channel.</p></div>
		<div className="grid gap-6 lg:grid-cols-2">
			<Card className="p-6"><CardHeader className="p-0 pb-4"><CardTitle>Bark</CardTitle></CardHeader><label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.barkEnabled} onChange={(e)=>setSettings({...settings,barkEnabled:e.target.checked})}/> Enable Bark</label><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="bark-url">Server URL</Label><Input id="bark-url" value={settings.barkUrl} onChange={(e)=>setSettings({...settings,barkUrl:e.target.value})}/></div><div className="space-y-1.5"><Label htmlFor="bark-tokens">Device token(s)</Label><Input id="bark-tokens" value={settings.barkTokens} onChange={(e)=>setSettings({...settings,barkTokens:e.target.value})}/></div><Button variant="outline" onClick={()=>test('bark')} disabled={testing!==null} className="gap-2"><Send className="h-4 w-4"/>{testing==='bark'?'Testing…':'Test Bark'}</Button></div>{resultBox('bark')}</Card>
			<Card className="p-6"><CardHeader className="p-0 pb-4"><CardTitle>ntfy</CardTitle></CardHeader><label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.ntfyEnabled} onChange={(e)=>setSettings({...settings,ntfyEnabled:e.target.checked})}/> Enable ntfy</label><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="ntfy-url">Server URL</Label><Input id="ntfy-url" value={settings.ntfyUrl} onChange={(e)=>setSettings({...settings,ntfyUrl:e.target.value})}/></div><div className="space-y-1.5"><Label htmlFor="ntfy-topic">Topic</Label><Input id="ntfy-topic" value={settings.ntfyTopic} onChange={(e)=>setSettings({...settings,ntfyTopic:e.target.value})}/></div><div className="space-y-1.5"><Label htmlFor="ntfy-token">Access token (optional)</Label><Input id="ntfy-token" type="password" autoComplete="new-password" value={ntfyToken} onChange={(e)=>{setNtfyToken(e.target.value);setClearNtfyToken(false);}} placeholder={settings.ntfyTokenConfigured?'Token configured — leave blank to keep it':'Optional — leave blank for public topics'}/><p className="text-[11px] text-muted-foreground">Only needed for topics that require authentication. Stored tokens are never returned to the browser.</p></div>{settings.ntfyTokenConfigured?<label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={clearNtfyToken} onChange={(e)=>setClearNtfyToken(e.target.checked)}/> Remove stored ntfy token</label>:null}<Button variant="outline" onClick={()=>test('ntfy')} disabled={testing!==null} className="gap-2"><Send className="h-4 w-4"/>{testing==='ntfy'?'Testing…':'Test ntfy'}</Button></div>{resultBox('ntfy')}</Card>
		</div>
		<div className="flex justify-end"><Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4"/>{saving?'Saving…':'Save settings'}</Button></div>
	</div>;
}
