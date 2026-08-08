/**
 * Rejects the passwords that get guessed first.
 *
 * Length and character-class rules alone still wave through `Password1` and
 * `Qwerty123` — the exact strings at the top of every credential-stuffing list.
 * This closes that gap without a dependency or a network call.
 *
 * The list is deliberately small: the login limiter already caps online guessing
 * at ten attempts per quarter hour, so the job here is to block the handful of
 * passwords an attacker would try in that budget, not to score entropy.
 */

/**
 * Common passwords that survive an 8-char upper/lower/digit rule. Stored
 * lower-cased and compared the same way, so `PASSWORD123` is caught too.
 */
const COMMON = new Set([
  'password1', 'password12', 'password123', 'password1234', 'password@123',
  'passw0rd', 'passw0rd1', 'passw0rd123', 'p@ssword1', 'p@ssw0rd', 'p@ssw0rd1',
  'p@ssw0rd123', 'welcome1', 'welcome123', 'welcome@123', 'qwerty123',
  'qwerty1234', 'qwertyui', 'qwerty@123', 'abcd1234', 'abc12345', 'abcd@1234',
  'a1b2c3d4', 'iloveyou1', 'iloveyou123', 'sunshine1', 'princess1', 'football1',
  'baseball1', 'superman1', 'trustno1', 'letmein1', 'letmein123', 'admin123',
  'admin@123', 'administrator1', 'root1234', 'test1234', 'test@123',
  'user1234', 'login123', 'master123', 'monkey123', 'dragon123', 'shadow123',
  'michael1', 'jennifer1', 'jordan23', 'india@123', 'india123', 'bharat123',
  'krishna1', 'krishna123', 'ganesh123', 'chennai123', 'mumbai123', 'delhi123',
  'summer2024', 'summer2025', 'winter2024', 'winter2025', 'spring2024',
  'spring2025', 'autumn2024', 'autumn2025', 'january2024', 'january2025',
  'changeme1', 'changeme123', 'secret123', 'default123', 'temp1234',
  'newpassword1', 'newpass123', 'mypassword1', 'password!1', 'zaq12wsx',
  '1qaz2wsx', '1q2w3e4r', '1qaz@wsx', 'qazwsx123', 'asdf1234', 'zxcv1234',
  'q1w2e3r4', 'aA123456', 'abc@1234', 'india@2024', 'india@2025',
]);

/** Three or more of the same character in a row — `Aaa111bbb` and friends. */
const REPEATED_RUN = /(.)\1{2,}/;

/**
 * Letters and digits are kept apart on purpose. Joined into one string they meet
 * at `...xyz0123...`, and a window straddling that seam would read as a run even
 * though nothing sequential was typed.
 */
const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789'].flatMap((alphabet) => [
  alphabet,
  [...alphabet].reverse().join(''),
]);

/** Four or more consecutive characters, forwards or backwards (`abcd`, `4321`). */
function hasSequentialRun(lowered) {
  for (let i = 0; i + 4 <= lowered.length; i += 1) {
    const chunk = lowered.slice(i, i + 4);
    if (SEQUENCES.some((seq) => seq.includes(chunk))) return true;
  }
  return false;
}

/**
 * Words drawn from the account itself, so `Rahul@1990` is refused for rahul@…
 * but stays available to anyone else. Anything under four characters is skipped
 * — a two-letter name would otherwise reject far too much.
 */
function personalTokens({ email, name } = {}) {
  const tokens = [];
  if (typeof email === 'string' && email.includes('@')) tokens.push(email.split('@')[0]);
  if (typeof name === 'string') tokens.push(...name.split(/\s+/));
  return tokens
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length >= 4);
}

/**
 * @returns {string|null} why the password is unacceptable, or null if it passes.
 */
function weaknessOf(password, context = {}) {
  if (typeof password !== 'string') return null; // length rules report this first

  const lowered = password.toLowerCase();

  if (COMMON.has(lowered)) {
    return 'This password is too common. Please choose something less predictable';
  }
  if (REPEATED_RUN.test(password)) {
    return 'Password must not repeat the same character three times in a row';
  }
  if (hasSequentialRun(lowered)) {
    return 'Password must not contain a run like "abcd" or "1234"';
  }
  if (personalTokens(context).some((token) => lowered.includes(token))) {
    return 'Password must not contain your name or email address';
  }

  return null;
}

module.exports = { weaknessOf };
