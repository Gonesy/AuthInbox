-- Repair the original shipped English default rule for databases that already applied 0004.
-- Restrict the update to the shipped rule name/description so custom rules are left untouched.
UPDATE regex_rules
SET pattern = '(?<![A-Za-z0-9])(?=[A-Za-z0-9]{4,8}(?![A-Za-z0-9]))(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+(?![A-Za-z0-9])',
	updated_at = CURRENT_TIMESTAMP
WHERE name = 'Generic verification code'
	AND description = 'Common English verification and OTP wording. Requires at least one digit.';
