# Security

buildbeat runs a local web server on `localhost` and watches your project directory. It makes no
outbound network calls and needs no credentials or API keys.

The server binds to all interfaces (`0.0.0.0`) by default so a browser on the host can reach it from
WSL. On a shared or untrusted network, run it on a port behind your firewall, or set
`BUILDBEAT_PORT` and restrict access.

If you find a security issue, please report it privately through GitHub's "Report a vulnerability"
(Security advisories) instead of opening a public issue.
