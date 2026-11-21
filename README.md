# 🚂 FastClockWeb

A high-visibility, large-format Railroad Standard Fast Clock and Digital Dispatch display for model railroads, dispatch offices, and train rooms. Connects to your local MQTT broker using the **Eclipse Paho JavaScript MQTT client** over WebSockets.

---

## ✨ Features

- **Traditional Railroad Standard Clock**:
  - **Montgomery Safety Dial**: Faithful recreation of the 1906 Henry S. Montgomery railroad dial with all 60 individual minute numerals along the outer chapter ring (5-minute markers highlighted in red).
  - **Canadian / Military 24-Hour Ring**: Inner red 13–24 numerals for railroad operating timetables.
  - **Classic Railroad Spade Hands**: Heavy spade hour hand, tapered whip minute hand, and counterweighted red sweeping second hand.
  - **Authentic Station Cases**: Vintage Station (Wood & Brass), Classic Railroad Enamel, Dispatcher Night (amber glow for dark train rooms), and Modern High-Contrast.
  - **Smooth 60 FPS Sweep or Stepped Tick**: Selectable in settings.

- **Digital Dispatch Clock**:
  - Large LED readout styled after authentic CTC dispatching boards.
  - Selectable LED colors: Railroad Signal Red, Dispatcher Amber, Highball Green, Ice Blue, and Cool White.
  - 12-Hour (AM/PM) or 24-Hour Military/Railroad standard time.
  - Fast clock ratio indicator (e.g. `1.0x`, `4.0x`, `PAUSED`).
  - Date banner and last MQTT sync timestamp.

- **Flexible Display Layouts**:
  - **Both**: Side-by-side (widescreen) or stacked (portrait/tablets).
  - **Railroad Only**: Fills the entire screen with the analog dial.
  - **Digital Only**: Fills the entire screen with the digital dispatch readout.
  - **Fullscreen Mode**: Press <kbd>F</kbd> or click the fullscreen button to hide all browser chrome for layout fascia screens, wall TVs, or tablets.

- **Eclipse Paho MQTT Client**:
  - Connects directly from the browser to your local MQTT broker via WebSockets (`ws://` or `wss://`).
  - **Zero Configuration Required**: Works out of the box with built-in defaults—no `config.js` required.
  - **Serving Host Default & Fallback**:
    1. Primary host configured in `config.js` or in the Settings modal
    2. Host where the page is being served (`window.location.hostname`) if the primary host cannot be reached
  - **Bidirectional FastClock Synchronization**:
    - Automatically discovers and subscribes to `{prefix}/time`, `{prefix}/rate`, `{prefix}/state`, and `{prefix}/cmd`.
    - Handles incoming broker rate and run/stop state changes seamlessly without time jumping.
    - Pushes rate changes (`RATE <multiplier>`) back to `{prefix}/cmd` when adjusted in the UI or by clicking the rate badge.
  - Automatic reconnection with backoff.

---

## 🚀 Quick Start

FastClockWeb is a **100% client-side, zero-dependency static web application**.

Simply open [`index.html`](index.html) directly in any web browser, or host it on any static web server (Nginx, Apache, Caddy, GitHub Pages, or a local server).

```bash
# macOS
open index.html

# Linux
xdg-open index.html
```

---

## ⚙️ Configuration File (`config.js`, Optional)

**No configuration file is required!** FastClockWeb automatically connects using sensible defaults:
- **Broker Host**: Defaults to where the page is served (`window.location.hostname`).
- **Port**: `9001` (standard WebSocket port)
- **Topic**: `layout/clock/time`

If you want to customize your defaults permanently, copy `config.example.js` to create your local `config.js`:

```bash
cp config.example.js config.js
```

You can configure your broker host, WebSocket port, topic, and default preferences directly in [`config.js`](config.js):

```javascript
window.FASTCLOCK_CONFIG = {
  // MQTT Broker hostname or LAN IP (leave empty '' to default to where the page is served)
  mqttHost: '',

  // WebSocket port on your MQTT broker (Mosquitto default is 9001)
  mqttPort: 9001,

  // WebSocket path (usually empty '' or '/mqtt')
  mqttPath: '',

  // MQTT Topic to subscribe to
  mqttTopic: 'layout/clock/time',

  // Use SSL / TLS (wss://)
  mqttUseSSL: false,

  // Optional authentication
  mqttUsername: '',
  mqttPassword: ''
};
```

You can also adjust these settings dynamically at any time using the in-browser **Settings (⚙)** modal.

---

## 📡 MQTT Configuration

### Mosquitto Broker Setup
Web browsers require MQTT over WebSockets. If you are using **Eclipse Mosquitto**, ensure your `mosquitto.conf` has a WebSocket listener enabled.

Add the following to `/etc/mosquitto/mosquitto.conf` (or `/opt/homebrew/etc/mosquitto/mosquitto.conf` on macOS):

```conf
# Standard MQTT TCP port for layout hardware / JMRI / Node-RED
listener 1883
allow_anonymous true

# WebSocket port for FastClockWeb
listener 9001
protocol websockets
allow_anonymous true
```

Restart Mosquitto:
```bash
# macOS Homebrew
brew services restart mosquitto

# Linux systemd
sudo systemctl restart mosquitto
```

### In FastClockWeb Settings
Click the **Gear (⚙)** icon in the upper-right corner of FastClockWeb:
- **Broker Host / IP**: Defaults to where the page is being served (or LAN IP/`localhost`)
- **WebSocket Port**: `9001`
- **Topic**: `layout/clock/time` (or your custom topic)
- Click **"Save & Connect"**

---

## 📨 FastClock Server & MQTT Protocol

FastClockWeb is fully compatible with [`FastClock`](https://github.com/Davepar/FastClock) (`fastclock.py`) as well as generic MQTT fast clock publishers.

### Topic Structure
FastClockWeb derives the topic prefix from your configured time topic (e.g. `layout/clock` from `layout/clock/time`) and subscribes to:
- `{prefix}/time` — Current fast clock time (`HH:MM` or `HH:MM:SS`, retained)
- `{prefix}/rate` — Speed multiplier (`1.00`, `4.00`, `8.00`, retained)
- `{prefix}/state` — Clock status (`ACTIVE` or `INACTIVE`, retained)
- `{prefix}/cmd` — Command stream (`RATE <multiplier>`, `START`, `STOP`, `SET <HH:MM>`)

### Bidirectional Rate Control
- **Broker -> Display**: When the broker publishes a rate update on `{prefix}/rate` (or `{prefix}/cmd`), FastClockWeb immediately updates its speed and synchronizes the digital badge and settings dropdown. The internal time-base is re-anchored on the fly so clock hands never jump or stutter.
- **Display -> Broker**: Clicking the digital `RATE: X.X:1` badge cycles through common ratios (`1:1`, `2:1`, `3:1`, `4:1`, `6:1`, `8:1`), or you can choose a ratio in the Settings dialog. FastClockWeb immediately sends `RATE <multiplier>` to `{prefix}/cmd` on the broker, synchronizing the FastClock server and all other connected layout displays.

---

## 📨 Supported MQTT Message Formats

FastClockWeb automatically detects and parses a wide variety of time formats:

### 1. FastClock Server Protocol (Standard)
- `{prefix}/time`: `"14:35"` or `"14:35:00"`
- `{prefix}/rate`: `"4.00"` or `"1.00"`
- `{prefix}/state`: `"ACTIVE"` or `"INACTIVE"`

### 2. Fast Clock JSON
```json
{"time": "14:35:00", "rate": 4.0, "status": "running"}
```
- `rate` or `ratio`: Fast clock ratio multiplier (e.g. `4.0` for 4:1 time, `1.0` for real-time).
- `status`: `"running"` or `"paused"`.
- Hand movement interpolates continuously between updates.

### 3. Discrete Time Values
```json
{"hours": 10, "minutes": 45, "seconds": 0, "rate": 4.0}
```

### 3. Plain Text Strings
```text
14:35:00
```
or
```text
02:35 PM
```

### 4. Unix Epoch Timestamps
Seconds or milliseconds:
```text
1732160000
```

### 5. ISO 8601 Strings
```text
2026-11-20T14:35:00
```

---

## ⌨️ Keyboard Shortcuts & Controls

- <kbd>F</kbd> : Toggle Fullscreen
- <kbd>Esc</kbd> : Close Settings dialog
- **Main Screen**: Clean display focused purely on the clocks, with subtle Fullscreen and Settings (⚙) icons in the upper corner.
- **Settings (⚙)**: Configure broker connection, display view style (Both/Railroad/Digital), station theme, LED color, 12H/24H format, seconds toggle, and dial features.

---

## 🛠️ File Structure

- `index.html` — Main user interface and SVG railroad clock dial.
- `style.css` — Responsive styles, station themes, and glowing LED display effects.
- `app.js` — Fast clock engine, SVG dial rendering, and Eclipse Paho MQTT client logic.
- `paho-mqtt.js` — Eclipse Paho JavaScript client library (100% offline).
