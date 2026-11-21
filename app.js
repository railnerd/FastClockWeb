/**
 * FastClock - Railroad & Digital Display Web Application
 * Powered by Eclipse Paho MQTT JavaScript Client
 */

(function () {
  'use strict';

  // --- State Configuration & Storage ---
  const STORAGE_KEY = 'fastclock_settings_v5';
  
  function getServingHost() {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const h = window.location.hostname.trim();
      if (h) return h;
    }
    return 'localhost';
  }

  const defaultSettings = {
    mqttHost: '', // Empty defaults to serving host (getServingHost()), falling back to localhost
    mqttPort: 9001,
    mqttPath: '',
    mqttTopic: 'layout/clock/time',
    mqttClientId: 'fastclock_web_' + Math.random().toString(16).substring(2, 8),
    mqttUseSSL: (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:'),
    mqttUsername: '',
    mqttPassword: '',
    viewMode: 'both', // 'both' | 'analog' | 'digital'
    theme: 'theme-wood',
    timeFormat: '12', // '12' | '24'
    handMotion: 'sweep', // 'sweep' | 'step'
    showSeconds: true,
    ledColor: 'red',
    clockRate: 4.0,
    showMontgomery: true,
    showInner24: true
  };

  let settings = Object.assign({}, defaultSettings);

  // Clock Engine State
  const clockState = {
    hasReceivedTime: false,
    baseFastMs: 0,
    basePerfMs: 0,
    rate: 4.0,
    isRunning: true,
    lastSyncTime: null,
    packetCount: 0
  };

  // Paho MQTT Client Instance
  let pahoClient = null;
  let isConnecting = false;
  let isConnected = false;
  let reconnectTimer = null;
  let activeHost = null;
  let hostAttemptIndex = 0;

  // DOM Elements Cache
  const elements = {};

  // --- Initialization ---
  function init() {
    loadSettings();
    cacheElements();
    renderDialMarkings();
    bindEvents();
    applySettingsToUI();

    // Start requestAnimationFrame clock render loop
    requestAnimationFrame(renderClockLoop);

    // Auto-connect to MQTT
    connectMqtt();
  }

  function loadSettings() {
    const fileConfig = (typeof window !== 'undefined' && window.FASTCLOCK_CONFIG) ? window.FASTCLOCK_CONFIG : {};

    let stored = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        stored = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }

    // Merge default settings, stored preferences, and config.js values
    // config.js explicitly set values for MQTT connection take priority
    settings = Object.assign({}, defaultSettings, stored);

    const savedViewMode = localStorage.getItem('fastclock_view_mode') || stored.viewMode;
    if (savedViewMode) {
      settings.viewMode = savedViewMode;
    } else if (fileConfig.defaultView) {
      settings.viewMode = fileConfig.defaultView;
    }

    if (fileConfig.mqttHost !== undefined) {
      settings.mqttHost = String(fileConfig.mqttHost).trim();
    }
    if (fileConfig.mqttPort !== undefined) settings.mqttPort = fileConfig.mqttPort;
    if (fileConfig.mqttPath !== undefined) settings.mqttPath = fileConfig.mqttPath;
    if (fileConfig.mqttTopic !== undefined) settings.mqttTopic = fileConfig.mqttTopic;
    if (fileConfig.mqttClientId !== undefined && fileConfig.mqttClientId.trim() !== '') {
      settings.mqttClientId = fileConfig.mqttClientId;
    }
    if (fileConfig.mqttUseSSL !== undefined) settings.mqttUseSSL = fileConfig.mqttUseSSL;
    if (fileConfig.mqttUsername !== undefined) settings.mqttUsername = fileConfig.mqttUsername;
    if (fileConfig.mqttPassword !== undefined) settings.mqttPassword = fileConfig.mqttPassword;

    if (fileConfig.defaultTheme && !stored.theme) settings.theme = fileConfig.defaultTheme;
    if (fileConfig.defaultTimeFormat && !stored.timeFormat) settings.timeFormat = fileConfig.defaultTimeFormat;
    if (fileConfig.defaultHandMotion && !stored.handMotion) settings.handMotion = fileConfig.defaultHandMotion;
    if (fileConfig.defaultClockRate && !stored.clockRate) settings.clockRate = fileConfig.defaultClockRate;

    clockState.rate = Number(settings.clockRate) || 4.0;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      if (settings.viewMode) {
        localStorage.setItem('fastclock_view_mode', settings.viewMode);
      }
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  }

  function cacheElements() {
    elements.body = document.body;
    elements.clockStage = document.getElementById('clockStage');
    elements.analogSection = document.getElementById('analogSection');
    elements.digitalSection = document.getElementById('digitalSection');
    elements.dialMarkings = document.getElementById('dialMarkings');

    // Analog Hands
    elements.clockHands = document.getElementById('clockHands');
    elements.hourHandGroup = document.getElementById('hourHandGroup');
    elements.minuteHandGroup = document.getElementById('minuteHandGroup');
    elements.secondHandGroup = document.getElementById('secondHandGroup');

    // Digital Digits
    elements.digHours = document.getElementById('digHours');
    elements.digMinutes = document.getElementById('digMinutes');
    elements.digSeconds = document.getElementById('digSeconds');
    elements.suffixAmPm = document.getElementById('suffixAmPm');
    elements.suffixMode = document.getElementById('suffixMode');
    elements.digDate = document.getElementById('digDate');
    elements.syncStatusSummary = document.getElementById('syncStatusSummary');
    elements.clockRateText = document.getElementById('clockRateText');

    // Status Badges & Controls
    elements.connectionStatusBadge = document.getElementById('connectionStatusBadge');
    elements.connectionStatusText = document.getElementById('connectionStatusText');
    elements.themeSelector = document.getElementById('themeSelector');
    elements.fullscreenBtn = document.getElementById('fullscreenBtn');
    elements.settingsBtn = document.getElementById('settingsBtn');

    // Digital Toolbar
    elements.btn12h = document.getElementById('btn12h');
    elements.btn24h = document.getElementById('btn24h');
    elements.btnToggleSeconds = document.getElementById('btnToggleSeconds');

    // Footer items
    elements.footerBroker = document.getElementById('footerBroker');
    elements.footerTopic = document.getElementById('footerTopic');
    elements.footerLastSync = document.getElementById('footerLastSync');
    elements.footerMsgCount = document.getElementById('footerMsgCount');

    // Settings Modal
    elements.settingsModal = document.getElementById('settingsModal');
    elements.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    elements.saveAndCloseBtn = document.getElementById('saveAndCloseBtn');

    // MQTT Form Fields
    elements.mqttHost = document.getElementById('mqttHost');
    elements.mqttPort = document.getElementById('mqttPort');
    elements.mqttPath = document.getElementById('mqttPath');
    elements.mqttTopic = document.getElementById('mqttTopic');
    elements.mqttClientId = document.getElementById('mqttClientId');
    elements.mqttUseSSL = document.getElementById('mqttUseSSL');
    elements.mqttUsername = document.getElementById('mqttUsername');
    elements.mqttPassword = document.getElementById('mqttPassword');
    elements.btnConnectMqtt = document.getElementById('btnConnectMqtt');
    elements.btnDisconnectMqtt = document.getElementById('btnDisconnectMqtt');
    elements.connFeedback = document.getElementById('connFeedback');

    // Clock Options Fields
    elements.defaultViewSelect = document.getElementById('defaultViewSelect');
    elements.clockHandMotion = document.getElementById('clockHandMotion');
    elements.timeFormatSelect = document.getElementById('timeFormatSelect');
    elements.defaultRatio = document.getElementById('defaultRatio');
    elements.showMontgomeryNumbers = document.getElementById('showMontgomeryNumbers');
    elements.showCanadianInner24 = document.getElementById('showCanadianInner24');
  }

  // --- SVG Dial Markings Generation ---
  /**
   * Generates the authentic Montgomery Railroad dial with individual 1-60 minute numbers,
   * 1-12 hour numerals, and Canadian/Military 13-24 inner ring.
   */
  function renderDialMarkings() {
    const g = elements.dialMarkings;
    g.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const cx = 300;
    const cy = 300;

    // 1. Minute Chapter Ring & Ticks (60 ticks)
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6) * (Math.PI / 180);
      const isFiveMin = (i % 5 === 0);
      const rOuter = 270;
      const rInner = isFiveMin ? 245 : 258;

      const x1 = cx + rOuter * Math.sin(angle);
      const y1 = cy - rOuter * Math.cos(angle);
      const x2 = cx + rInner * Math.sin(angle);
      const y2 = cy - rInner * Math.cos(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke-width', isFiveMin ? '3.5' : '1.5');
      line.setAttribute('class', 'dial-marking-tick');
      fragment.appendChild(line);

      // Montgomery individual minute numerals (1 to 60) along the outer perimeter
      if (settings.showMontgomery) {
        const rMont = 256;
        const mx = cx + rMont * Math.sin(angle);
        const my = cy - rMont * Math.cos(angle);

        const mNum = (i === 0) ? 60 : i;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mx);
        text.setAttribute('y', my + 4.5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', isFiveMin ? 'dial-montgomery-num dial-montgomery-red' : 'dial-montgomery-num');
        text.textContent = mNum;
        fragment.appendChild(text);
      }
    }

    // Outer and Inner chapter ring circular borders
    const circleOuter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleOuter.setAttribute('cx', cx);
    circleOuter.setAttribute('cy', cy);
    circleOuter.setAttribute('r', 270);
    circleOuter.setAttribute('fill', 'none');
    circleOuter.setAttribute('stroke', 'currentColor');
    circleOuter.setAttribute('stroke-width', '2');
    circleOuter.setAttribute('class', 'dial-marking-tick');
    fragment.appendChild(circleOuter);

    const circleInner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleInner.setAttribute('cx', cx);
    circleInner.setAttribute('cy', cy);
    circleInner.setAttribute('r', 244);
    circleInner.setAttribute('fill', 'none');
    circleInner.setAttribute('stroke', 'currentColor');
    circleInner.setAttribute('stroke-width', '1.5');
    circleInner.setAttribute('class', 'dial-marking-tick');
    fragment.appendChild(circleInner);

    // 2. Bold Hour Numerals 1 to 12
    const rHour = 192;
    for (let h = 1; h <= 12; h++) {
      const angle = (h * 30) * (Math.PI / 180);
      const hx = cx + rHour * Math.sin(angle);
      const hy = cy - rHour * Math.cos(angle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', hx);
      text.setAttribute('y', hy + 16); // vertical baseline alignment
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '50');
      text.setAttribute('class', 'dial-marking-hour-num');
      text.textContent = h;
      fragment.appendChild(text);
    }

    // 3. Canadian / Military Inner 24-Hour Ring (13 to 24)
    if (settings.showInner24) {
      const r24 = 138;
      for (let h = 1; h <= 12; h++) {
        const angle = (h * 30) * (Math.PI / 180);
        const num24 = (h === 12) ? 24 : (h + 12);
        const x24 = cx + r24 * Math.sin(angle);
        const y24 = cy - r24 * Math.cos(angle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x24);
        text.setAttribute('y', y24 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'dial-inner-24-num');
        text.textContent = num24;
        fragment.appendChild(text);
      }
    }

    g.appendChild(fragment);
  }

  // --- Clock Animation & Render Loop ---
  function getCurrentFastTime() {
    if (!clockState.isRunning) {
      return new Date(clockState.baseFastMs);
    }
    const elapsedPerfMs = performance.now() - clockState.basePerfMs;
    const fastMs = clockState.baseFastMs + (elapsedPerfMs * clockState.rate);
    return new Date(fastMs);
  }

  function updateHandPositions(now) {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    let secondAngle, minuteAngle, hourAngle;

    if (settings.handMotion === 'step') {
      secondAngle = seconds * 6;
      minuteAngle = minutes * 6 + (seconds / 60) * 6;
      hourAngle = (hours % 12) * 30 + (minutes / 60) * 30;
    } else {
      // Smooth continuous 60fps sweep
      const secWithFraction = seconds + (milliseconds / 1000);
      secondAngle = secWithFraction * 6;
      minuteAngle = (minutes + secWithFraction / 60) * 6;
      hourAngle = ((hours % 12) + minutes / 60 + secWithFraction / 3600) * 30;
    }

    if (elements.hourHandGroup) {
      elements.hourHandGroup.setAttribute('transform', `rotate(${hourAngle} 300 300)`);
    }
    if (elements.minuteHandGroup) {
      elements.minuteHandGroup.setAttribute('transform', `rotate(${minuteAngle} 300 300)`);
    }
    if (elements.secondHandGroup) {
      elements.secondHandGroup.setAttribute('transform', `rotate(${secondAngle} 300 300)`);
    }
  }

  // Cached digital render values to prevent DOM churn
  let lastDigSec = -1;
  let lastDigDay = -1;

  function renderClockLoop() {
    if (!clockState.hasReceivedTime) {
      // Defer rendering until first MQTT time packet arrives
      requestAnimationFrame(renderClockLoop);
      return;
    }

    const now = getCurrentFastTime();

    // 1. Render Analog Hands only when analog view is active
    if (settings.viewMode !== 'digital') {
      updateHandPositions(now);
    }

    // 2. Render Digital Clock only when digital view is active
    if (settings.viewMode !== 'analog') {
      const currentSec = now.getSeconds();
      if (currentSec !== lastDigSec) {
        lastDigSec = currentSec;

        let displayHours = now.getHours();
        let ampm = '';

        if (settings.timeFormat === '12') {
          ampm = displayHours >= 12 ? 'PM' : 'AM';
          displayHours = displayHours % 12;
          if (displayHours === 0) displayHours = 12;
        }

        const strHours = String(displayHours).padStart(2, '0');
        const strMinutes = String(now.getMinutes()).padStart(2, '0');
        const strSeconds = String(currentSec).padStart(2, '0');

        if (elements.digHours) elements.digHours.textContent = strHours;
        if (elements.digMinutes) elements.digMinutes.textContent = strMinutes;
        if (elements.digSeconds) elements.digSeconds.textContent = strSeconds;
        if (elements.suffixAmPm) {
          elements.suffixAmPm.textContent = settings.timeFormat === '12' ? ampm : '24H';
        }

        // Format date string only when the day changes
        const currentDay = now.getDate();
        if (currentDay !== lastDigDay) {
          lastDigDay = currentDay;
          if (elements.digDate) {
            const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
            elements.digDate.textContent = now.toLocaleDateString(undefined, options).toUpperCase();
          }
        }
      }
    }

    // Loop continuously
    requestAnimationFrame(renderClockLoop);
  }

  // --- MQTT Payload Parsing ---
  /**
   * Intelligently parses various MQTT time formats:
   * 1. Plain text: "14:35", "14:35:20", "2:35 PM"
   * 2. JSON: {"time": "14:35:00", "rate": 4.0}, {"hours": 14, "minutes": 35}, {"rate": 4}
   * 3. Unix epoch numbers: 1732159800 or 1732159800000
   * 4. ISO timestamp strings: "2026-11-20T14:35:00"
   */
  function handleMqttMessage(payloadStr) {
    clockState.packetCount++;
    clockState.lastSyncTime = new Date();

    if (elements.footerLastSync) {
      elements.footerLastSync.textContent = clockState.lastSyncTime.toLocaleTimeString();
    }
    if (elements.footerMsgCount) {
      elements.footerMsgCount.textContent = clockState.packetCount;
    }
    if (elements.syncStatusSummary) {
      elements.syncStatusSummary.textContent = `MQTT Sync: ${clockState.lastSyncTime.toLocaleTimeString()}`;
    }

    const trimmed = payloadStr.trim();
    let newDate = null;
    let newRate = null;
    let newRunning = null;

    // A. Try JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const data = JSON.parse(trimmed);
        if (typeof data.rate === 'number') newRate = data.rate;
        if (typeof data.ratio === 'number') newRate = data.ratio;
        if (typeof data.multiplier === 'number') newRate = data.multiplier;

        if (typeof data.status === 'string') {
          newRunning = (data.status.toLowerCase() === 'running');
        } else if (typeof data.running === 'boolean') {
          newRunning = data.running;
        } else if (typeof data.paused === 'boolean') {
          newRunning = !data.paused;
        }

        if (data.time !== undefined) {
          newDate = parseTimeStringOrDate(data.time);
        } else if (data.hours !== undefined && data.minutes !== undefined) {
          const d = getCurrentFastTime();
          d.setHours(Number(data.hours));
          d.setMinutes(Number(data.minutes));
          d.setSeconds(Number(data.seconds || 0));
          d.setMilliseconds(Number(data.ms || 0));
          newDate = d;
        }
      } catch (e) {
        console.warn('JSON parse error on MQTT payload', e);
      }
    }

    // B. If not parsed by JSON, try raw string/number
    if (!newDate) {
      newDate = parseTimeStringOrDate(trimmed);
    }

    // Apply updates if valid
    if (newDate && !isNaN(newDate.getTime())) {
      clockState.baseFastMs = newDate.getTime();
      clockState.basePerfMs = performance.now();

      if (!clockState.hasReceivedTime) {
        clockState.hasReceivedTime = true;
        // Position hands immediately to received time before fading in
        updateHandPositions(newDate);
        if (elements.clockHands) {
          elements.clockHands.classList.add('is-synced');
        }
      }
    }

    if (newRate !== null) {
      clockState.rate = newRate;
      updateRateBadge(newRate);
    }

    if (newRunning !== null) {
      clockState.isRunning = newRunning;
      if (elements.suffixMode) {
        elements.suffixMode.textContent = newRunning ? (clockState.rate + 'x') : 'PAUSED';
      }
    }
  }

  function parseTimeStringOrDate(val) {
    if (typeof val === 'number') {
      // Epoch seconds vs ms check
      return (val < 10000000000) ? new Date(val * 1000) : new Date(val);
    }

    if (typeof val !== 'string') return null;
    const str = val.trim();

    // 1. Pure epoch string
    if (/^\d{10,13}$/.test(str)) {
      const num = Number(str);
      return (num < 10000000000) ? new Date(num * 1000) : new Date(num);
    }

    // 2. ISO timestamp format
    if (str.includes('T') || str.includes('-')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
    }

    // 3. Time format: "HH:MM", "HH:MM:SS", "HH:MM:SS AM/PM"
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;

      const d = getCurrentFastTime();
      d.setHours(h);
      d.setMinutes(m);
      d.setSeconds(s);
      d.setMilliseconds(0);
      return d;
    }

    return null;
  }

  function updateRateBadge(rate) {
    if (elements.clockRateText) {
      elements.clockRateText.textContent = `${rate.toFixed(1)}x`;
    }
    if (elements.suffixMode) {
      elements.suffixMode.textContent = clockState.isRunning ? `${rate.toFixed(1)}x` : 'PAUSED';
    }
  }

  // --- Eclipse Paho MQTT Integration ---
  /**
   * Generates candidate broker hosts in prioritized order:
   * 1. Explicitly configured host (from config.js or settings modal)
   * 2. Host where page is being served (getServingHost())
   * 3. 'localhost'
   */
  function getCandidateHosts() {
    const list = [];
    const configuredHost = (settings.mqttHost && settings.mqttHost.trim()) ? settings.mqttHost.trim() : '';
    const servingHost = getServingHost();

    // 1. If configured host is provided, try it first
    if (configuredHost) {
      list.push(configuredHost);
    }

    // 2. Fallback to serving host (where the page is hosted) if different
    if (servingHost && !list.includes(servingHost)) {
      list.push(servingHost);
    }

    // 3. Fallback to localhost if not already in the list
    if (!list.includes('localhost') && !list.includes('127.0.0.1')) {
      list.push('localhost');
    }

    if (list.length === 0) {
      list.push('localhost');
    }

    return list;
  }

  function connectMqtt(attemptIndex = 0) {
    if (isConnecting || isConnected) return;

    if (typeof Paho === 'undefined' || !Paho.MQTT || !Paho.MQTT.Client) {
      updateStatusBadge('disconnected', 'Paho Library Error');
      return;
    }

    const candidateHosts = getCandidateHosts();
    hostAttemptIndex = (attemptIndex >= 0 && attemptIndex < candidateHosts.length) ? attemptIndex : 0;
    activeHost = candidateHosts[hostAttemptIndex];

    const isFallback = (hostAttemptIndex > 0);
    const primaryHost = candidateHosts[0];

    if (isFallback) {
      updateStatusBadge('connecting', `Trying ${activeHost}...`);
    } else {
      updateStatusBadge('connecting', 'Connecting...');
    }

    isConnecting = true;

    const port = Number(settings.mqttPort) || 9001;
    const path = settings.mqttPath ? (settings.mqttPath.startsWith('/') ? settings.mqttPath : '/' + settings.mqttPath) : '';
    const clientId = settings.mqttClientId.trim() || ('fastclock_' + Math.random().toString(16).substr(2, 6));

    if (elements.footerBroker) {
      const fallbackTag = isFallback ? ' (fallback)' : '';
      elements.footerBroker.textContent = `${settings.mqttUseSSL ? 'wss' : 'ws'}://${activeHost}:${port}${path}${fallbackTag}`;
    }
    if (elements.footerTopic) {
      elements.footerTopic.textContent = settings.mqttTopic;
    }

    try {
      pahoClient = new Paho.MQTT.Client(activeHost, port, path, clientId);

      pahoClient.onConnectionLost = onConnectionLost;
      pahoClient.onMessageArrived = onMessageArrived;

      const connectOptions = {
        useSSL: !!settings.mqttUseSSL,
        cleanSession: true,
        keepAliveInterval: 30,
        timeout: 4, // 4-second timeout to quickly fallback if hostname cannot be resolved
        onSuccess: onConnectSuccess,
        onFailure: onConnectFailure
      };

      if (settings.mqttUsername && settings.mqttUsername.trim().length > 0) {
        connectOptions.userName = settings.mqttUsername.trim();
        if (settings.mqttPassword) {
          connectOptions.password = settings.mqttPassword;
        }
      }

      pahoClient.connect(connectOptions);
    } catch (err) {
      isConnecting = false;
      isConnected = false;
      console.error(`MQTT setup error for ${activeHost}:`, err);
      handleHostFailure(err.message || 'Config Error');
    }
  }

  function onConnectSuccess() {
    isConnecting = false;
    isConnected = true;
    const candidateHosts = getCandidateHosts();
    const primaryHost = candidateHosts[0];
    const isFallback = (hostAttemptIndex > 0);

    updateStatusBadge('connected', isFallback ? `MQTT Connected (${activeHost})` : 'MQTT Connected');

    if (elements.connFeedback) {
      elements.connFeedback.textContent = isFallback
        ? `Connected via fallback to ${activeHost}:${settings.mqttPort}!`
        : `Connected to ${activeHost}:${settings.mqttPort}!`;
      elements.connFeedback.style.color = '#22c55e';
    }

    // Subscribe to fast clock topic
    const topic = settings.mqttTopic.trim() || 'layout/clock/time';
    try {
      pahoClient.subscribe(topic, { qos: 0 });
      console.log(`Subscribed to topic: ${topic} on ${activeHost}`);
    } catch (e) {
      console.error('Subscription error:', e);
    }
  }

  function onConnectFailure(responseObject) {
    isConnecting = false;
    isConnected = false;
    const msg = (responseObject && responseObject.errorMessage) ? responseObject.errorMessage : 'Connection failed';
    console.warn(`MQTT connection failed on ${activeHost}: ${msg}`);
    handleHostFailure(msg);
  }

  function handleHostFailure(errorMessage) {
    const candidateHosts = getCandidateHosts();
    const nextIndex = hostAttemptIndex + 1;

    // If there is another fallback host in the cascade (serving host or localhost):
    if (nextIndex < candidateHosts.length) {
      const nextHost = candidateHosts[nextIndex];
      console.log(`Could not reach '${activeHost}'. Falling back to '${nextHost}'...`);
      updateStatusBadge('connecting', `Trying ${nextHost}...`);
      if (elements.connFeedback) {
        elements.connFeedback.textContent = `Could not reach ${activeHost}. Trying ${nextHost}...`;
        elements.connFeedback.style.color = '#f59e0b';
      }
      setTimeout(() => {
        connectMqtt(nextIndex);
      }, 500);
      return;
    }

    // All candidate hosts failed
    updateStatusBadge('disconnected', 'MQTT Offline');
    if (elements.connFeedback) {
      elements.connFeedback.textContent = `Failed (${activeHost}): ${errorMessage}`;
      elements.connFeedback.style.color = '#ef4444';
    }

    scheduleReconnect();
  }

  function onConnectionLost(responseObject) {
    isConnecting = false;
    isConnected = false;
    updateStatusBadge('disconnected', 'MQTT Disconnected');
    console.warn('MQTT Connection lost:', responseObject.errorMessage);

    if (elements.connFeedback) {
      elements.connFeedback.textContent = `Lost connection: ${responseObject.errorMessage}`;
      elements.connFeedback.style.color = '#f59e0b';
    }

    scheduleReconnect();
  }

  function onMessageArrived(message) {
    const payload = message.payloadString;
    handleMqttMessage(payload);
  }

  function disconnectMqtt() {
    hostAttemptIndex = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pahoClient && isConnected) {
      try {
        pahoClient.disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    }
    isConnected = false;
    isConnecting = false;
    updateStatusBadge('disconnected', 'Disconnected');
    if (elements.connFeedback) {
      elements.connFeedback.textContent = 'Disconnected manually.';
      elements.connFeedback.style.color = 'var(--text-muted)';
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('Attempting MQTT auto-reconnect (retrying primary host)...');
      connectMqtt(0);
    }, 6000);
  }

  function updateStatusBadge(status, label) {
    if (!elements.connectionStatusBadge) return;
    elements.connectionStatusBadge.className = `status-pill status-${status}`;
    if (elements.connectionStatusText) {
      elements.connectionStatusText.textContent = label;
    }
  }

  // --- UI & Event Handlers ---
  function bindEvents() {
    // View Switcher Buttons
    document.querySelectorAll('.pill-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setViewMode(btn.dataset.view);
      });
    });

    // Theme Selector
    if (elements.themeSelector) {
      elements.themeSelector.addEventListener('change', (e) => {
        setTheme(e.target.value);
      });
    }

    // Fullscreen Toggle
    if (elements.fullscreenBtn) {
      elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!elements.settingsModal || elements.settingsModal.hasAttribute('hidden')) {
          toggleFullscreen();
        }
      }
      if (e.key === 'Escape') {
        closeModal();
      }
    });

    // Settings Modal
    if (elements.settingsBtn) elements.settingsBtn.addEventListener('click', openModal);
    if (elements.closeSettingsBtn) elements.closeSettingsBtn.addEventListener('click', closeModal);
    if (elements.saveAndCloseBtn) elements.saveAndCloseBtn.addEventListener('click', saveAndApplySettings);

    // Modal Tabs
    document.querySelectorAll('.tab-btn[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Digital Toolbar 12H / 24H
    if (elements.btn12h) {
      elements.btn12h.addEventListener('click', () => setTimeFormat('12'));
    }
    if (elements.btn24h) {
      elements.btn24h.addEventListener('click', () => setTimeFormat('24'));
    }
    if (elements.btnToggleSeconds) {
      elements.btnToggleSeconds.addEventListener('click', toggleSeconds);
    }

    // LED Color Chips
    document.querySelectorAll('.color-chip[data-color]').forEach(chip => {
      chip.addEventListener('click', () => {
        setLedColor(chip.dataset.color);
      });
    });

    // MQTT Connect / Disconnect Buttons in Modal
    if (elements.btnConnectMqtt) {
      elements.btnConnectMqtt.addEventListener('click', () => {
        saveFormToSettings();
        disconnectMqtt();
        connectMqtt();
      });
    }
    if (elements.btnDisconnectMqtt) {
      elements.btnDisconnectMqtt.addEventListener('click', disconnectMqtt);
    }
  }

  function setViewMode(mode) {
    settings.viewMode = mode;
    elements.clockStage.className = 'clock-stage';
    if (mode === 'analog') {
      elements.clockStage.classList.add('view-analog');
    } else if (mode === 'digital') {
      elements.clockStage.classList.add('view-digital');
    }
    if (elements.defaultViewSelect) {
      elements.defaultViewSelect.value = mode;
    }
    document.querySelectorAll('.pill-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
    saveSettings();
  }

  function setTheme(theme) {
    settings.theme = theme;
    elements.body.className = theme;
    if (elements.themeSelector) elements.themeSelector.value = theme;
    saveSettings();
  }

  function setTimeFormat(fmt) {
    settings.timeFormat = fmt;
    lastDigSec = -1; // Force immediate digital display refresh
    if (elements.btn12h) elements.btn12h.classList.toggle('active', fmt === '12');
    if (elements.btn24h) elements.btn24h.classList.toggle('active', fmt === '24');
    if (elements.timeFormatSelect) elements.timeFormatSelect.value = fmt;
    saveSettings();
  }

  function toggleSeconds() {
    settings.showSeconds = !settings.showSeconds;
    elements.body.classList.toggle('hide-seconds', !settings.showSeconds);
    if (elements.btnToggleSeconds) {
      elements.btnToggleSeconds.textContent = settings.showSeconds ? 'SEC ON' : 'SEC OFF';
      elements.btnToggleSeconds.classList.toggle('active', settings.showSeconds);
    }
    saveSettings();
  }

  function setLedColor(color) {
    settings.ledColor = color;
    document.querySelectorAll('.color-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.color === color);
    });

    const root = document.documentElement;
    const colorMap = {
      red: { color: '#ff3333', glow: 'rgba(255, 51, 51, 0.55)', inactive: 'rgba(255, 51, 51, 0.08)' },
      amber: { color: '#ffb000', glow: 'rgba(255, 176, 0, 0.55)', inactive: 'rgba(255, 176, 0, 0.08)' },
      green: { color: '#2aff6b', glow: 'rgba(42, 255, 107, 0.55)', inactive: 'rgba(42, 255, 107, 0.08)' },
      blue: { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', inactive: 'rgba(56, 189, 248, 0.08)' },
      white: { color: '#f1f5f9', glow: 'rgba(241, 245, 249, 0.5)', inactive: 'rgba(241, 245, 249, 0.08)' }
    };

    const cfg = colorMap[color] || colorMap.red;
    root.style.setProperty('--led-color', cfg.color);
    root.style.setProperty('--led-glow', cfg.glow);
    root.style.setProperty('--led-inactive', cfg.inactive);

    saveSettings();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  function openModal() {
    populateSettingsForm();
    elements.settingsModal.removeAttribute('hidden');
  }

  function closeModal() {
    elements.settingsModal.setAttribute('hidden', '');
  }

  function populateSettingsForm() {
    const servingHost = getServingHost();
    elements.mqttHost.value = settings.mqttHost || '';
    elements.mqttHost.placeholder = `Default: ${servingHost}`;
    elements.mqttPort.value = settings.mqttPort;
    elements.mqttPath.value = settings.mqttPath;
    elements.mqttTopic.value = settings.mqttTopic;
    elements.mqttClientId.value = settings.mqttClientId;
    elements.mqttUseSSL.checked = settings.mqttUseSSL;
    elements.mqttUsername.value = settings.mqttUsername || '';
    elements.mqttPassword.value = settings.mqttPassword || '';

    if (elements.defaultViewSelect) elements.defaultViewSelect.value = settings.viewMode;
    elements.clockHandMotion.value = settings.handMotion;
    elements.timeFormatSelect.value = settings.timeFormat;
    elements.defaultRatio.value = String(settings.clockRate);
    elements.showMontgomeryNumbers.checked = settings.showMontgomery;
    elements.showCanadianInner24.checked = settings.showInner24;
  }

  function saveFormToSettings() {
    settings.mqttHost = elements.mqttHost.value.trim();
    settings.mqttPort = Number(elements.mqttPort.value) || 9001;
    settings.mqttPath = elements.mqttPath.value.trim();
    settings.mqttTopic = elements.mqttTopic.value.trim();
    settings.mqttClientId = elements.mqttClientId.value.trim();
    settings.mqttUseSSL = elements.mqttUseSSL.checked;
    settings.mqttUsername = elements.mqttUsername.value.trim();
    settings.mqttPassword = elements.mqttPassword.value;

    if (elements.defaultViewSelect) settings.viewMode = elements.defaultViewSelect.value;
    settings.handMotion = elements.clockHandMotion.value;
    settings.timeFormat = elements.timeFormatSelect.value;
    settings.clockRate = Number(elements.defaultRatio.value) || 4.0;
    settings.showMontgomery = elements.showMontgomeryNumbers.checked;
    settings.showInner24 = elements.showCanadianInner24.checked;

    clockState.rate = settings.clockRate;
    updateRateBadge(settings.clockRate);

    saveSettings();
  }

  function saveAndApplySettings() {
    saveFormToSettings();
    applySettingsToUI();
    renderDialMarkings();
    closeModal();

    // Reconnect MQTT with updated settings
    disconnectMqtt();
    connectMqtt();
  }

  function applySettingsToUI() {
    setTheme(settings.theme);
    setViewMode(settings.viewMode);
    setTimeFormat(settings.timeFormat);
    setLedColor(settings.ledColor);

    if (!settings.showSeconds) {
      elements.body.classList.add('hide-seconds');
      if (elements.btnToggleSeconds) {
        elements.btnToggleSeconds.textContent = 'SEC OFF';
        elements.btnToggleSeconds.classList.remove('active');
      }
    }

    updateRateBadge(settings.clockRate);

    // Update active view pill
    document.querySelectorAll('.pill-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === settings.viewMode);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
