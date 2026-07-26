# Security policy

Kettle Desktop is pre-1.0. Until releases begin, security fixes target the
latest commit on `main`.

Do not open a public issue for a vulnerability. Use GitHub private vulnerability
reporting for
[charlesberret/kettle-desktop](https://github.com/charlesberret/kettle-desktop/security/advisories/new).
Include the affected version, a minimal reproduction, and the expected security
boundary.

The shell is designed for a single user on one Mac. Its trusted network surface
is a compatible core on `127.0.0.1`; remote serving is unsupported. The Electron
window uses context isolation, disables Node integration, denies permission
requests, and permits navigation only to the selected localhost core.
