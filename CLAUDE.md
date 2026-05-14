# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`iobroker.questdb` is an ioBroker adapter that stores IoT state data from ioBroker in a [QuestDB](https://questdb.io) time-series database.

- **Runtime**: Node.js ≥ 20, CommonJS
- **Entry point**: `index.js` → delegates to `build/main.js` (compiled output)
- **Core dependencies**: `@iobroker/adapter-core` ^3.3.2, `@questdb/nodejs-client` ^4.2.0

## Architecture

ioBroker adapters extend the `Adapter` class from `@iobroker/adapter-core`. Key lifecycle events: `ready`, `stateChange`, `objectChange`, `message`, `unload`.

```
src/main.ts              — adapter class with lifecycle handlers
src/lib/types.ts         — AdapterConfig, DatapointCustomConfig, PendingWrite, TableMappingEntry
src/lib/utils.ts         — pure helpers: sanitizeId(), getCustomConfigFromObj()
src/lib/questdb-client.ts — QuestDbClient wrapping @questdb/nodejs-client Sender
src/lib/buffer.ts        — WriteBuffer: debounce + last-write-wins + batch flush
src/lib/object-cache.ts  — ObjectCache: maps state ID → DatapointCustomConfig | null
src/lib/adapter-config.d.ts — augments ioBroker.AdapterConfig with native config fields
admin/jsonConfig.json    — instance config UI (i18n enabled)
admin/jsonCustom.json    — per-datapoint config UI (i18n enabled)
admin/i18n/en.json       — English translations (keys = English text)
admin/i18n/de.json       — German translations
test/unit/               — unit tests (mocha + chai + sinon + tsx/cjs)
```

## Key Design Decisions

- **One table per state** (default): state ID sanitized via `sanitizeId()` (dots → underscores, strip non-alphanumeric)
- **Wide-table mode**: multiple states mapped to named columns in a shared table via `tableMappings` config
- **WriteBuffer** debounces writes and batches them for efficient ILP flushing
- **`senderFactory` injection** on `QuestDbClient` constructor enables unit testing without a real QuestDB
- **`info.connection`** state tracks live connection status (required by ioBroker developer guide)
- **Raw `setTimeout`** used for reconnect timer — `isUnloading` guard on `connectToQuestDb()` prevents race with unload; buffer timers managed via `destroy()` in `onUnload`

## Commands

```sh
npm install          # install dependencies
npm run build        # compile TypeScript → build/
npm run check        # type-check without emitting
npm test             # run unit tests + package tests
npm run test:ts      # unit tests only (mocha with tsx/cjs)
npm run test:package # ioBroker package structure validation
npm run translate    # auto-translate i18n via iobroker translator service
npm run release      # create release via @alcalzone/release-script
```

## ioBroker Developer Guide Compliance

This adapter follows the [ioBroker AI Developer Guide](https://github.com/Jey-Cee/iobroker-ai-developer-guide):

- Admin UI uses JSONConfig (`jsonConfig.json` + `jsonCustom.json`) — no legacy HTML
- `adapter.terminate()` used instead of `process.exit()`
- Password stored via `nativeEncrypted` + `protectedNative` in io-package.json
- `setObjectNotExists` / `extendObject` pattern (adapter creates no custom states beyond `info.connection`)
- `info.connection` state in `instanceObjects` tracks QuestDB connectivity
- `ack: true` used for all `setState` calls from the adapter
- Compact mode supported (`compact: true` in io-package.json)
- Object IDs use only A-Za-z0-9-_ (enforced by `sanitizeId()`)
- All resources cleaned up in `onUnload` (reconnect timer, write buffer, QuestDB connection)

## Release Process

Releases are published to npm via GitHub Actions on version tags. To cut a release:

1. Run `npm run release` — bumps versions in `package.json` and `io-package.json`, updates changelog
2. Push the resulting commit and tag
3. GitHub Actions builds and publishes to npm automatically

Before first npm publish: set up trusted publishing at https://docs.npmjs.com/trusted-publishers (uncomment the deploy job in `.github/workflows/test-and-release.yml`).

## Adapter Checker

Before submitting to the ioBroker repository, validate the adapter at:
https://www.iobroker.dev/adapter-check

## Post-MVP Work

- `getHistory` API (read historical data from QuestDB via PostgreSQL wire protocol on port 8812)
- Full integration tests against a live QuestDB instance
- Translations for languages beyond English and German (use https://translator.iobroker.in/)
