# FastClockWeb

A large-format Railroad Standard Fast Clock and Digital Dispatch display for model railroads, dispatch offices, and train rooms. It runs completely in the browser with no build step and connects to your local MQTT broker over WebSockets via **Eclipse Paho MQTT**.

---

## Features

### Analog Railroad Clock
- **Montgomery Safety Dial**: Recreation of the 1906 Henry S. Montgomery dial with individual 1–60 minute numerals along the outer chapter ring (5-minute markers highlighted in red).
- **Canadian / Military 24-Hour Ring**: Inner red 13–24 numerals for timetable operations.
- **Classic Railroad Hands**: Spade hour hand, tapered whip minute hand, and counterweighted red sweeping second hand.
- **Station Cases & Motion**: Four themes (*Vintage Station*, *Classic Railroad Enamel*, *Dispatcher Night*, *Modern High-Contrast*) with selectable 60 FPS continuous sweep or 1-second stepped motion.
- **Paused State**: Hands freeze in place when the fast clock is stopped.

### Digital Dispatch Clock
- **Clean LED Readout**: High-contrast 7-segment style display (`DSEG7Classic`) inside a distraction-free bezel.
- **5 LED Colors**: Railroad Signal Red, Dispatcher Amber, Highball Green, Ice Blue, and Cool White.
- **12-Hour & 24-Hour Modes**: Displays `AM`/`PM` in 12-hour mode, or pure digits without extra badges in 24-hour railroad mode, with optional `:SS` seconds.

### Display & Controls
- **Flexible Layouts**: Side-by-side (**Both**), **Railroad Standard Clock Only**, or **Digital Display Only** (automatically stacks on portrait screens and tablets).
- **Auto-Hiding Controls**: Top-right floating buttons fade out after 4 seconds of inactivity and wake on tap, click, mouse movement, or keypress. When the clock is paused, the glowing `⏸` indicator stays visible as an operational reminder.
- **Fullscreen Ready**: Supports desktop fullscreen (<kbd>F</kbd>) and edge-to-edge iPad/tablet fullscreen (`viewport-fit=cover`).
- **Organized Settings Dialog**: **Clock Options** opens first by default, followed by **MQTT Connection**, with collapsible sections for secondary display and advanced connection options.

### MQTT Synchronization
- **Zero-Config Defaults**: Connects automatically without a `config.js` file, falling back to `window.location.hostname` on port `9001` if a configured host is unreachable.
- **Bidirectional Control**: Subscribes to `{prefix}/time`, `{prefix}/rate`, `{prefix}/state`, and `{prefix}/cmd`, and pushes `START`, `STOP`, `RATE`, and `SET` commands back to `{prefix}/cmd` from Settings.

---

## Quick Start

FastClockWeb is a 100% client-side static web application. Open [`index.html`](index.html) directly in a browser or serve the folder from any static web server (Nginx, Apache, Caddy, or GitHub Pages).

```bash
# macOS
open index.html

# Linux
xdg-open index.html
```

---

## Mosquitto / Broker Setup

Browsers require MQTT over WebSockets (`ws://` or `wss://`). If you use **Eclipse Mosquitto**, enable a WebSocket listener in `/etc/mosquitto/mosquitto.conf` (or `/opt/homebrew/etc/mosquitto/mosquitto.conf` on macOS):

```conf
# Standard MQTT TCP port for layout hardware / JMRI / FastClock server
listener 1883
allow_anonymous true

# WebSocket port for FastClockWeb
listener 9001
protocol websockets
allow_anonymous true
```

Restart Mosquitto after editing:

```bash
# macOS Homebrew
brew services restart mosquitto

# Linux systemd
sudo systemctl restart mosquitto
```

In FastClockWeb, click **Settings (⚙)** &rarr; **MQTT Connection**, verify the **Broker Host / IP**, **MQTT Topic**, and **WebSocket Port** (`9001`), and click **Connect MQTT** (or **Save & Close**).

---

## MQTT Protocol & Supported Formats

FastClockWeb is compatible with [`FastClock`](https://github.com/railnerd/FastClock) (`fastclock.py`), JMRI, and generic MQTT time publishers.

### Topic Structure

FastClockWeb derives `{prefix}` from your configured time topic (for example, `layout/clock` from `layout/clock/time`):

| Topic | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `{prefix}/time` | Broker &rarr; Display | `HH:MM` or `HH:MM:SS` | Current simulated fast time (retained) |
| `{prefix}/rate` | Broker &rarr; Display | Float (e.g. `4.00`) | Fast clock speed multiplier (retained) |
| `{prefix}/state` | Broker &rarr; Display | `ACTIVE` / `INACTIVE` | Running or stopped state (retained) |
| `{prefix}/cmd` | Bidirectional | `START`, `STOP`, `RATE <n>`, `SET <HH:MM>` | Control commands |

### Supported Time Payloads

| Format | Example | Notes |
| :--- | :--- | :--- |
| Plain text time | `14:35`, `14:35:00`, `02:35 PM` | Standard FastClock / JMRI format |
| Fast Clock JSON | `{"time": "14:35:00", "rate": 4.0, "status": "running"}` | Also accepts `ratio` and `"paused"` |
| Discrete JSON | `{"hours": 10, "minutes": 45, "seconds": 0, "rate": 4.0}` | Individual time fields |
| Unix epoch | `1732160000` | Seconds or milliseconds |
| ISO 8601 | `2026-11-20T14:35:00` | Standard ISO timestamp |

---

## Configuration (`config.js`, Optional)

No configuration file is required. Built-in defaults connect to `window.location.hostname` on port `9001` and subscribe to `layout/clock/time`.

To customize permanent defaults, copy [`config.example.js`](config.example.js) to `config.js`:

```bash
cp config.example.js config.js
```

```javascript
window.FASTCLOCK_CONFIG = {
  mqttHost: '',                  // Empty defaults to the serving host
  mqttPort: 9001,                // Mosquitto WebSocket port
  mqttPath: '',                  // Optional WS path (e.g. '/mqtt')
  mqttTopic: 'layout/clock/time',
  mqttUseSSL: false,
  mqttUsername: '',
  mqttPassword: ''
};
```

See [`config.example.js`](config.example.js) for additional display defaults (`defaultView`, `defaultTheme`, `defaultTimeFormat`, `defaultHandMotion`, and `defaultClockRate`).

---

## Controls & Keyboard Shortcuts

| Control / Key | Action |
| :--- | :--- |
| <kbd>F</kbd> or **Fullscreen (`⛶`)** | Toggle fullscreen display |
| **Settings (`⚙`)** | Open Clock Options & MQTT Connection settings |
| **Stopped Indicator (`⏸`)** | Appears when the clock is paused; click to open Settings |
| <kbd>Esc</kbd> | Close the Settings dialog |

### Setting Time & Rate in Settings
Under **Clock Options**:
- **Fast Clock Time (24-Hour / HH:MM)**: Enter 24-hour (`14:30`) or military (`1430`) time and click **Set Time** (or press <kbd>Enter</kbd>) to update locally and broadcast `SET HH:MM` to `{prefix}/cmd`. Click **Current Real Time** to sync to your device's clock.
- **Fast Clock Ratio**: Selecting a new ratio pushes `RATE <multiplier>` to `{prefix}/cmd`.
- **Pause / Resume Fast Clock**: Sends `STOP` or `START` to `{prefix}/cmd`.

---

## Hosting with `local-web-server` & Docker

FastClockWeb can be hosted under a subpath (such as `/fastclock/`) alongside other layout apps using [`local-web-server`](https://github.com/railnerd/local-web-server):

```bash
python3 ../local-web-server/local_web_server.py --mount /fastclock=. --port 8000
```

To build an asset-only Docker image for compositing:

```bash
docker build --target assets -t fastclock-web:assets .
```

See [`local-web-server/DEPLOY.md`](https://github.com/railnerd/local-web-server/blob/main/DEPLOY.md) for Raspberry Pi (`systemd` or Docker Compose) setup instructions.

---

## Project Structure

| File / Folder | Purpose |
| :--- | :--- |
| [`index.html`](index.html) | Main clock layout, SVG dial face, and Settings dialog |
| [`style.css`](style.css) | Responsive layouts, station themes, LED styling, and auto-hide rules |
| [`app.js`](app.js) | Fast clock engine, SVG dial markings, idle timer, and Paho MQTT client |
| [`config.example.js`](config.example.js) | Optional template for creating a local `config.js` |
| [`site.json`](site.json) | App metadata (`name`, `description`, `icon`) for the `local-web-server` landing page |
| [`Dockerfile`](Dockerfile) | Multi-target asset/standalone image definition for container composition |
| [`paho-mqtt.js`](paho-mqtt.js) | Bundled Eclipse Paho JavaScript MQTT client (offline-ready) |
| `fonts/` | Local `DSEG7Classic` WOFF2 web fonts for the digital readout |
