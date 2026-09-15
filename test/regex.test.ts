import { describe, expect, it } from 'vitest';
import { extractWithRegex, validateRegexRule, type RegexRule } from '../src/services/regex';

const rule: RegexRule = { id: 1, name: 'OTP', enabled: true, contextKeywords: ['verification code', 'OTP', '验证码'], pattern: '\\b(?=[A-Za-z0-9]{4,8}\\b)(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+\\b', description: '', priority: 100 };

describe('context-aware regex extraction', () => {
	it('extracts English numeric OTP near context', () => expect(extractWithRegex('Your verification code is 583921.', [rule])?.code).toBe('583921'));
	it('extracts Chinese OTP near context', () => expect(extractWithRegex('您的验证码：625193，请勿泄露。', [rule])?.code).toBe('625193'));
	it('extracts alphanumeric OTP containing a digit', () => expect(extractWithRegex('Your OTP is A7K9P2.', [rule])?.code).toBe('A7K9P2'));
	it('does not treat unrelated bare numbers as codes', () => expect(extractWithRegex('Order #583921 placed on 20260915. Phone 12345678.', [rule])).toBeNull());
	it('uses rule priority', () => { const later = { ...rule, id: 2, name: 'Later', priority: 200 }; const earlier = { ...rule, id: 3, name: 'Earlier', priority: 10 }; expect(extractWithRegex('verification code 123456', [later, earlier])?.ruleName).toBe('Earlier'); });
});

describe('regex rule validation', () => {
	it('rejects empty context', () => expect(validateRegexRule({ name: 'Bad', contextKeywords: [], pattern: '\\d+' })).toMatch(/context/i));
	it('rejects invalid regex', () => expect(validateRegexRule({ name: 'Bad', contextKeywords: ['OTP'], pattern: '(' })).toMatch(/invalid/i));
});
