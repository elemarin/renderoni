# Support

## Beta support

Renderoni 0.9 is a beta release. Please report reproducible bugs and package
installation problems in [GitHub Issues](https://github.com/elemarin/renderoni/issues).
Include the package version, Node version, browser/bundler, and a minimal
reproduction when possible.

Install this prerelease with `npm install renderoni@beta three
@dimforge/rapier3d-compat` and run the MCP server with `npx renderoni@beta mcp`.
`renderoni` without an npm dist-tag is future stable-release wording; it will
apply once a `latest` release exists.

Questions and feature discussions belong in
[GitHub Discussions](https://github.com/elemarin/renderoni/discussions).

Only documented package exports are supported in this beta. In particular,
`renderoni/assets`, `renderoni/replays`, and `renderoni/network` are internal
source modules and must not be imported by consumers.
