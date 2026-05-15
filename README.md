![Logo](admin/questdb.png)

# ioBroker.questdb

[![NPM version](https://img.shields.io/npm/v/iobroker.questdb.svg)](https://www.npmjs.com/package/iobroker.questdb)
[![Downloads](https://img.shields.io/npm/dm/iobroker.questdb.svg)](https://www.npmjs.com/package/iobroker.questdb)
![Number of Installations](https://iobroker.live/badges/questdb-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/questdb-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.questdb.png?downloads=true)](https://nodei.co/npm/iobroker.questdb/)

**Tests:** ![Test and Release](https://github.com/pva2007/ioBroker.questdb/workflows/Test%20and%20Release/badge.svg)

## questdb adapter for ioBroker

Stores ioBroker state history in a [QuestDB](https://questdb.io) time-series database. Each enabled datapoint gets its own QuestDB table, written via the InfluxDB Line Protocol (ILP) over HTTP, HTTPS, or TCP.

---

## Features

- **Per-datapoint opt-in** — enable/disable logging per object in the ioBroker object browser
- **Table alias** — map any state to a custom QuestDB table name
- **Wide-table mapping** — map multiple states to named columns in a shared QuestDB table
- **Debounce & batching** — configurable debounce per instance and per datapoint; last-write-wins within the window
- **Automatic reconnect** — recovers from QuestDB unavailability without restarting the adapter
- **Test Connection button** — verify your QuestDB connection directly from the adapter config UI
- **Encrypted password** — credentials stored encrypted by ioBroker
- **HTTPS support** — connect via HTTPS with optional TLS verification skip for private CAs

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| ioBroker js-controller | ≥ 6.0.11 |
| ioBroker Admin | ≥ 7.6.20 |
| QuestDB | ≥ 7.0 |

---

## Installation

Install via the ioBroker Admin UI:

1. Open **Admin → Adapters**
2. Search for **QuestDB**
3. Click **Install**

---

## QuestDB Setup

The adapter writes data using QuestDB's InfluxDB Line Protocol (ILP). Make sure the relevant port is accessible from your ioBroker host:

| Protocol | Default Port | Purpose |
|---|---|---|
| HTTP | 9000 | ILP writes + web console |
| HTTPS | 443 | ILP writes behind reverse proxy |
| TCP | 9009 | ILP writes (high throughput) |

**Recommended: HTTP on port 9000** — provides error feedback on failed writes.

Quick start with Docker:

```sh
docker run -d \
  --name questdb \
  -p 9000:9000 \
  -p 9009:9009 \
  -v questdb_data:/root/.questdb \
  questdb/questdb
```

The QuestDB web console is then available at `http://<your-host>:9000`.

---

## Adapter Configuration

Open the adapter instance settings in ioBroker Admin.

### Connection

| Field | Default | Description |
|---|---|---|
| Protocol | HTTP | `HTTP` (port 9000), `HTTPS` (port 443), or `TCP` (port 9009) |
| Host | localhost | QuestDB hostname or IP |
| Port | 9000 | QuestDB port |
| Username | _(empty)_ | Optional — leave empty if auth is disabled |
| Password | _(empty)_ | Optional — stored encrypted |
| Skip TLS verification | off | Only for HTTPS with self-signed/private CA certificates |

Click **Test Connection** after filling in the connection details to verify reachability before saving.

### Write Behavior

| Field | Default | Description |
|---|---|---|
| Write only acknowledged states | ✅ | Skip unconfirmed command values (`ack: false`) |
| Debounce interval (ms) | 0 | Wait this long before writing; collects rapid updates into one write (0 = write immediately) |
| Max batch size | 1000 | Flush immediately when this many pending rows accumulate |
| Flush interval (ms) | 5000 | Push buffered rows to QuestDB on this interval (0 = only flush at max batch size) |
| Reconnect interval (ms) | 30000 | How long to wait before retrying after a connection failure |
| Write timeout (ms) | 10000 | HTTP request timeout per flush |

---

## Enabling States for Logging

States are **not** logged by default. Enable them individually in the ioBroker object browser:

1. Open **Admin → Objects**
2. Find the state you want to log
3. Click the **pencil icon** (edit) on the state
4. Switch to the **Custom** tab
5. Enable the **QuestDB** adapter instance
6. Toggle **Store in QuestDB**
7. Optionally set a **Table alias** and **Debounce override**
8. Save

### Per-Datapoint Options

| Option | Default | Description |
|---|---|---|
| Store in QuestDB | off | Enable logging for this state |
| Table alias | _(empty)_ | Custom QuestDB table name. If empty, the state ID is used with dots replaced by underscores (e.g. `zigbee_0_sensor_temperature`) |
| Debounce override (ms) | -1 | Per-state debounce. `-1` uses the instance default |

---

## Wide-table Mappings

The **Wide-table Mappings** section lets you map multiple ioBroker states to named columns in a single shared QuestDB table — useful for storing related sensor readings together.

| Column | Description |
|---|---|
| State ID | Full ioBroker state ID (e.g. `zigbee.0.sensor.temperature`) |
| QuestDB table | Target table name |
| Column name | Column name for this state's value |

Example: mapping outdoor temperature, humidity, and pressure to a single `outdoor_weather` table.

---

## Data Model

### Per-datapoint mode (default)

Each enabled state writes to its own table. The table name is either the alias or the sanitized state ID (dots → underscores).

Example query for `zigbee.0.living_room.temperature`:

```sql
SELECT timestamp, stateId, value
FROM zigbee_0_living_room_temperature
WHERE timestamp > dateadd('d', -1, now())
ORDER BY timestamp;
```

| Column | Type | Description |
|---|---|---|
| `timestamp` | TIMESTAMP | Original ioBroker state timestamp |
| `stateId` | SYMBOL | Full ioBroker state ID (indexed) |
| `value` | DOUBLE / BOOLEAN / VARCHAR | State value |

### Wide-table mode

States mapped via Wide-table Mappings write to a shared table with one column per state:

```sql
SELECT timestamp, outdoor_temp_c, outdoor_humidity_pct
FROM outdoor_weather
SAMPLE BY 1h ALIGN TO CALENDAR;
```

### Querying Examples

```sql
-- Last 24 hours
SELECT timestamp, value
FROM zigbee_0_living_room_temperature
WHERE timestamp > dateadd('d', -1, now());

-- Hourly averages
SELECT timestamp, avg(value) avg_temp
FROM zigbee_0_living_room_temperature
SAMPLE BY 1h ALIGN TO CALENDAR;
```

---

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### 0.3.7 (2026-05-15)
* Fix `encryptedNative`/`protectedNative` placement — must be top-level in io-package.json, not inside `common`
* Add `md`/`lg`/`xl` responsive size attributes to admin UI connection fields
* Fix schema URLs in `.vscode/settings.json` for io-package.json and jsonConfig files
* Add complete i18n translations for all 9 languages (ru, uk, es, fr, it, nl, pl, pt, zh-cn)

### 0.3.6 (2026-05-14)
* Fix Test Connection crash when admin sends null message payload
* Send current form values to adapter so unsaved changes can be tested

### 0.3.5 (2026-05-14)
* Fix `encryptedNative`/`protectedNative` field placement in io-package.json
* Add multilingual news translations (ru, pt, nl, fr, it, es, pl, uk, zh-cn)
* Fix dependabot config: remove invalid `day` setting, increase PR limit to 15
* Rename automerge workflow to standard `automerge-dependabot.yml`
* Add `needs: check-and-lint` gate to adapter-tests job
* Add `.vscode/settings.json` with JSON schema definitions

### 0.3.4 (2026-05-14)
* Fix npm publish: pass npm-token to testing-action-deploy

### 0.3.3 (2026-05-14)
* Enable automated npm publishing via GitHub Actions trusted publishing

### 0.3.2 (2026-05-14)
* Fix CI: enable TypeScript build step and add test:unit alias for testing-action

### 0.3.1 (2026-05-14)
* Initial GitHub/npm community release
* Added `info.connection` state for connection status tracking
* Switched to MIT license
* Full ioBroker developer guide compliance (compact mode, proper io-package structure)

### 0.3.0 (2025-05-06)
* Added HTTPS protocol support
* Added insecure TLS option for self-signed/private CA certificates
* Added global flush interval for batching ILP writes
* Improved test connection feedback
* Fixed non-compact mode startup

### 0.2.0 (2025-04-15)
* Added wide-table mapping: map multiple states to named columns in a shared QuestDB table

### 0.1.0 (2025-04-01)
* Initial release

---

## License

MIT License

Copyright (c) 2026 pva2007 <ioBroker.questdb@noreply.github.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
