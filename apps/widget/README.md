# QuickVoice widget

## Hosts with Content Security Policy

The widget creates styles inside its shadow root. To allow those styles under a
strict CSP, supply the host page's per-response nonce on the loader script:

```html
<quickvoice-widget widget-id="YOUR_WIDGET_ID"></quickvoice-widget>
<script async nonce="HOST_GENERATED_NONCE"
  src="https://api.quickvoice.co/widget/v1/quickvoice-widget.js"></script>
```

The widget copies the script's nonce to each style block, including styles created
when opening/closing the panel and changing call state. You can set a different
style nonce directly on the widget when your script and style policies use
separate nonces:

```html
<quickvoice-widget widget-id="YOUR_WIDGET_ID" nonce="HOST_STYLE_NONCE"></quickvoice-widget>
<script async nonce="HOST_SCRIPT_NONCE"
  src="https://api.quickvoice.co/widget/v1/quickvoice-widget.js"></script>
```

The host must generate an unpredictable nonce for each HTML response and put the
same style nonce in its CSP, for example `style-src 'self' 'nonce-HOST_STYLE_NONCE'`.
If `style-src-elem` is set, it must also authorize that nonce. Replace placeholders
server-side; do not use a fixed nonce or add `unsafe-inline`. The loader script
must separately be allowed by `script-src`, and the API and LiveKit connections
must be allowed by `connect-src` as appropriate for your deployment.

A `style-src 'self'` policy alone still blocks the generated inline styles. Hosts
must authorize the style nonce; this widget does not ship an external stylesheet
option. Hosts without restrictive style policies can keep the existing snippet.

## Checks

```sh
pnpm --filter quickvoice-widget build
pnpm --filter quickvoice-widget test
pnpm --filter quickvoice-widget check-types
```
