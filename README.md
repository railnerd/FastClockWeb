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
  - Automatic reconnection with exponential backoff.

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
- **Broker Host / IP**: `localhost` (or the LAN IP of your broker, e.g. `192.168.1.100`)
- **WebSocket Port**: `9001`
- **Topic**: `layout/clock` (or your custom topic)
- Click **"Save & Connect"**

---

## 📨 Supported MQTT Message Formats

FastClockWeb automatically detects and parses a wide variety of time formats:

### 1. Fast Clock JSON (Recommended)
```json
{"time": "14:35:00", "rate": 4.0, "status": "running"}
```
- `rate` or `ratio`: Fast clock ratio multiplier (e.g. `4.0` for 4:1 time, `1.0` for real-time).
- `status`: `"running"` or `"paused"`.
- Hand movement interpolates continuously between updates.

### 2. Discrete Time Values
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
- Top bar buttons: Quickly switch between **Both**, **Railroad**, and **Digital** views, or switch visual themes.

---

## 🛠️ File Structure

- `index.html` — Main user interface and SVG railroad clock dial.
- `style.css` — Responsive styles, station themes, and glowing LED display effects.
- `app.js` — Fast clock engine, SVG dial rendering, and Eclipse Paho MQTT client logic.
- `paho-mqtt.js` — Eclipse Paho JavaScript client library (100% offline).
