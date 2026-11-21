/**
 * FastClock Configuration File
 *
 * Edit this file to configure your local MQTT broker and clock settings.
 * This file is loaded automatically when FastClockWeb starts.
 */
window.FASTCLOCK_CONFIG = {
  // MQTT Broker hostname or IP address.
  // Optional: Leave empty '' to default directly to where the page is being served (window.location.hostname).
  // If the specified broker cannot be reached, FastClock automatically falls back to the serving host.
  mqttHost: '',

  // WebSocket port on your MQTT broker (default Mosquitto WebSocket port is 9001)
  mqttPort: 9001,

  // Optional WebSocket path (e.g. '/mqtt' or empty '' for root)
  mqttPath: '',

  // MQTT Topic to subscribe to for clock / fast-clock time updates
  mqttTopic: 'layout/clock/time',

  // Optional Client ID (leave empty to generate a random client ID)
  mqttClientId: '',

  // Use SSL / TLS (wss://). Set to true if your broker uses secure WebSockets
  mqttUseSSL: false,

  // Optional MQTT authentication (leave empty if broker allows anonymous access)
  mqttUsername: '',
  mqttPassword: '',

  // Display Defaults:
  // defaultView: 'both' | 'analog' | 'digital'
  defaultView: 'both',

  // defaultTheme: 'theme-wood' (Vintage Station) | 'theme-porcelain' | 'theme-dispatcher' | 'theme-modern'
  defaultTheme: 'theme-wood',

  // defaultTimeFormat: '12' (AM/PM) | '24' (Railroad Standard)
  defaultTimeFormat: '12',

  // defaultHandMotion: 'sweep' (Continuous smooth 60fps) | 'step' (1-second tick)
  defaultHandMotion: 'sweep',

  // defaultClockRate: Fast clock ratio multiplier (e.g. 4.0 for 4:1 fast clock)
  defaultClockRate: 4.0
};
