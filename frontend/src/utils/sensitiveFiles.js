// Files whose contents must never leave the machine for the ghost analyzer or the inline
// completer (Claude): dotenv files, private keys, credentials, a pending commit message.
// Matched on the path basename. Kept in sync with two other copies of this list:
//   - vscode-extension/extension.js  (SENSITIVE_FILE_RE)
//   - security.py                    (is_sensitive_path, server-side backstop)
// If you change one, change all three.
export const SENSITIVE_FILE_RE = /(^|\/)(\.env[^/]*|[^/]*\.pem|id_rsa[^/]*|[^/]*credentials[^/]*|COMMIT_EDITMSG)$/i;

export function isSensitivePath(path) {
    return typeof path === 'string' && SENSITIVE_FILE_RE.test(path);
}
