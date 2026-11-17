DELETE FROM verification
WHERE identifier GLOB 'sign-in-otp-*'
AND rowid NOT IN (
  SELECT MAX(rowid) FROM verification WHERE identifier GLOB 'sign-in-otp-*' GROUP BY identifier
);

CREATE UNIQUE INDEX verification_sign_in_code
ON verification (identifier) WHERE identifier GLOB 'sign-in-otp-*';
