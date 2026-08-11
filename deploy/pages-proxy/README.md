# TRACE Pages test proxy

This Pages deployment keeps `trace-code.pages.dev` as the public test origin while forwarding requests to the full-stack staging Worker.

It is intentionally a test bridge. The Worker remains the application runtime until a Pages-compatible full-stack build and database boundary are implemented.
