# Component Documentation

This project is currently a static HTML application rather than a component-framework repository, so introducing Storybook solely for compliance would add unnecessary runtime and dependency weight.

The stable shared UI contracts are documented here:

## Back navigation
- `js/premium-back.js`
- `css/premium-back.css`
- `[data-spike-premium-back]`

## Telemetry
- `js/telemetry.js`
- `window.SPIKETelemetry.record(type, payload)`
- `window.SPIKETelemetry.flush()`

## Theme
- `js/theme.js`
- Theme persistence must remain isolated from auth/data state.

When the application is migrated to React/Vue/Svelte or another component runtime, these contracts should become Storybook stories with keyboard and axe coverage.
