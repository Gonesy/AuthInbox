export interface RegexRule {
	id: number;
	name: string;
	enabled: boolean;
	contextKeywords: string[];
	pattern: string;
	description: string;
	priority: number;
}

export interface RegexMatch {
	code: string;
	ruleId: number;
	ruleName: string;
	contextExcerpt: string;
}

export interface RegexRuleInput {
	name: string;
	enabled?: boolean;
	contextKeywords: string[];
	pattern: string;
	description?: string;
	priority?: number;
}

const MAX_PATTERN_LENGTH = 500;
const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LENGTH = 100;
const MAX_INPUT_LENGTH = 200_000;
const CONTEXT_RADIUS = 120;

export function validateRegexRule(input: RegexRuleInput): string | null {
	if (!input.name?.trim()) return 'Rule name is required.';
	if (!Array.isArray(input.contextKeywords) || input.contextKeywords.length === 0) return 'At least one context keyword is required.';
	if (input.contextKeywords.length > MAX_KEYWORDS) return `At most ${MAX_KEYWORDS} context keywords are allowed.`;
	if (input.contextKeywords.some((keyword) => !keyword.trim() || keyword.length > MAX_KEYWORD_LENGTH)) return `Context keywords must be non-empty and at most ${MAX_KEYWORD_LENGTH} characters.`;
	if (!input.pattern?.trim()) return 'Regex pattern is required.';
	if (input.pattern.length > MAX_PATTERN_LENGTH) return `Regex pattern must be at most ${MAX_PATTERN_LENGTH} characters.`;
	try { new RegExp(input.pattern, 'i'); } catch { return 'Regex pattern is invalid.'; }
	return null;
}

export async function listEnabledRegexRules(db: D1Database): Promise<RegexRule[]> {
	const { results } = await db.prepare(`SELECT id, name, enabled, context_keywords AS contextKeywords, pattern, description, priority FROM regex_rules WHERE enabled = 1 ORDER BY priority ASC, id ASC`).all<Record<string, unknown>>();
	const rules: RegexRule[] = [];
	for (const row of results ?? []) {
		try {
			const keywords = JSON.parse(String(row.contextKeywords || '[]')) as unknown;
			if (!Array.isArray(keywords) || !keywords.every((item) => typeof item === 'string')) continue;
			const rule: RegexRule = { id: Number(row.id), name: String(row.name || ''), enabled: Number(row.enabled) === 1, contextKeywords: keywords, pattern: String(row.pattern || ''), description: String(row.description || ''), priority: Number(row.priority || 100) };
			if (!validateRegexRule(rule)) rules.push(rule);
		} catch (error) { console.warn('Skipping malformed regex rule', row.id, error); }
	}
	return rules;
}

export function extractWithRegex(text: string, rules: RegexRule[]): RegexMatch | null {
	const source = text.slice(0, MAX_INPUT_LENGTH);
	const lower = source.toLocaleLowerCase();
	const ordered = [...rules].filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority || a.id - b.id);
	for (const rule of ordered) {
		if (validateRegexRule(rule)) continue;
		let regex: RegExp;
		try { regex = new RegExp(rule.pattern, 'i'); } catch { continue; }
		for (const keyword of rule.contextKeywords) {
			const needle = keyword.toLocaleLowerCase();
			let position = lower.indexOf(needle);
			while (position >= 0) {
				const start = Math.max(0, position - CONTEXT_RADIUS);
				const end = Math.min(source.length, position + keyword.length + CONTEXT_RADIUS);
				const window = source.slice(start, end);
				const match = regex.exec(window);
				if (match?.[0]) return { code: match[0], ruleId: rule.id, ruleName: rule.name, contextExcerpt: window.replace(/\s+/g, ' ').trim().slice(0, 260) };
				position = lower.indexOf(needle, position + needle.length);
			}
		}
	}
	return null;
}

export async function extractMailWithRegex(db: D1Database, subject: string, rawEmail: string): Promise<RegexMatch | null> {
	try { return extractWithRegex(`${subject}\n${rawEmail}`, await listEnabledRegexRules(db)); }
	catch (error) { console.warn('Regex rules unavailable; continuing to optional AI fallback', error); return null; }
}
