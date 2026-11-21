/**
 * FastClock - Railroad & Digital Display Web Application
 * Powered by Eclipse Paho MQTT JavaScript Client
 */

(function () {
  'use strict';

  // --- State Configuration & Storage ---
  const STORAGE_KEY = 'fastclock_settings_v5';
  
  function getServingHost() {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.hostname && window.location.hostname.trim()) {
        return window.location.hostname.trim();
      }
      if (window.location.protocol === 'file:') {
        return 'localhost';
      }
    }
    return '';
  }

  const defaultSettings = {
    mqttHost: '', // Empty defaults dynamically to serving host (getServingHost())
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

    // Status Badges & Controls
    elements.clockStoppedBtn = document.getElementById('clockStoppedBtn');
    elements.connectionStatusBadge = document.getElementById('connectionStatusBadge');
    elements.connectionStatusText = document.getElementById('connectionStatusText');
    elements.fullscreenBtn = document.getElementById('fullscreenBtn');
    elements.settingsBtn = document.getElementById('settingsBtn');

    // Telemetry items (inside settings modal)
    elements.footerBroker = document.getElementById('footerBroker');
    elements.footerTopic = document.getElementById('footerTopic');
    elements.footerLastSync = document.getElementById('footerLastSync');
    elements.footerMsgCount = document.getElementById('footerMsgCount');
    elements.telemetryState = document.getElementById('telemetryState');

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
    elements.themeSelector = document.getElementById('themeSelector');
    elements.defaultViewSelect = document.getElementById('defaultViewSelect');
    elements.clockHandMotion = document.getElementById('clockHandMotion');
    elements.timeFormatSelect = document.getElementById('timeFormatSelect');
    elements.showSecondsCheck = document.getElementById('showSecondsCheck');
    elements.currentColorLabel = document.getElementById('currentColorLabel');
    elements.ledColorFormGroup = document.getElementById('ledColorFormGroup');
    elements.digitalSecondsFormGroup = document.getElementById('digitalSecondsFormGroup');
    elements.defaultRatio = document.getElementById('defaultRatio');
    elements.btnToggleClockState = document.getElementById('btnToggleClockState');
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

    // 1. Render Analog Hands only when analog view is active and clock is running
    if (settings.viewMode !== 'digital' && clockState.isRunning) {
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
          elements.suffixAmPm.textContent = settings.timeFormat === '12' ? ampm : '';
        }
      }
    }

    // Loop continuously
    requestAnimationFrame(renderClockLoop);
  }

  // --- MQTT Payload Parsing ---
  function getTopicPrefix() {
    const raw = (settings.mqttTopic && settings.mqttTopic.trim()) || 'layout/clock/time';
    const stripped = raw.replace(/\/(time|rate|state|cmd|#|\*|\+)$/i, '');
    return stripped || 'layout/clock';
  }

  function applyNewTime(newDate) {
    clockState.baseFastMs = newDate.getTime();
    clockState.basePerfMs = performance.now();

    if (!clockState.hasReceivedTime) {
      clockState.hasReceivedTime = true;
      updateHandPositions(newDate);
      if (elements.clockHands) {
        elements.clockHands.classList.add('is-synced');
      }
    } else if (!clockState.isRunning && settings.viewMode !== 'digital') {
      updateHandPositions(newDate);
    }
  }

  function setClockRate(newRate, source = 'local') {
    const r = Number(newRate);
    if (isNaN(r) || r < 0) return;

    // Smoothly re-anchor animation base to prevent hands/digits from jumping
    if (clockState.hasReceivedTime) {
      const currentFast = getCurrentFastTime();
      clockState.baseFastMs = currentFast.getTime();
      clockState.basePerfMs = performance.now();
    }

    clockState.rate = r;
    settings.clockRate = r;
    updateRateBadge(r);
    updateRateSelect(r);
    saveSettings();

    // If initiated locally by user, push to MQTT broker command topic
    if (source === 'local') {
      publishRateToBroker(r);
    }
  }

  function setClockRunning(running, source = 'local') {
    if (clockState.isRunning === running) {
      updateStatusIndicators();
      return;
    }

    if (clockState.hasReceivedTime) {
      const currentFast = getCurrentFastTime();
      clockState.baseFastMs = currentFast.getTime();
      clockState.basePerfMs = performance.now();
    }

    clockState.isRunning = running;

    // Immediately update hands to exact stopped or resumed time
    if (clockState.hasReceivedTime && settings.viewMode !== 'digital') {
      updateHandPositions(getCurrentFastTime());
    }

    updateStatusIndicators();
    updateRateBadge(clockState.rate);

    // If initiated locally, send START / STOP to MQTT broker command topic
    if (source === 'local') {
      publishStateToBroker(running);
    }
  }

  function publishStateToBroker(running) {
    if (!pahoClient || !isConnected) {
      console.log('Not connected to MQTT; clock state updated locally only');
      return;
    }

    const prefix = getTopicPrefix();
    const cmdTopic = `${prefix}/cmd`;
    const cmdPayload = running ? 'START' : 'STOP';

    try {
      const msg = new Paho.MQTT.Message(cmdPayload);
      msg.destinationName = cmdTopic;
      msg.qos = 0;
      pahoClient.send(msg);
      console.log(`Published ${cmdPayload} to ${cmdTopic}`);

      if (elements.connFeedback) {
        elements.connFeedback.textContent = `Pushed ${cmdPayload} command to ${cmdTopic}`;
        elements.connFeedback.style.color = '#22c55e';
      }
    } catch (err) {
      console.warn(`Failed to publish state to ${cmdTopic}:`, err);
    }
  }

  function updateStatusIndicators() {
    const isRunning = Boolean(clockState.isRunning);

    // 1. Direct DOM control for stopped indicator button in floating screen controls
    if (elements.clockStoppedBtn) {
      if (isRunning) {
        elements.clockStoppedBtn.setAttribute('hidden', '');
        elements.clockStoppedBtn.style.display = 'none';
        elements.clockStoppedBtn.classList.remove('is-stopped');
      } else {
        elements.clockStoppedBtn.removeAttribute('hidden');
        elements.clockStoppedBtn.style.display = 'inline-flex';
        elements.clockStoppedBtn.classList.add('is-stopped');
      }
    }

    // 2. Body class for global CSS styles and animations
    if (elements.body) {
      elements.body.classList.toggle('is-clock-stopped', !isRunning);
      elements.body.classList.toggle('is-clock-running', isRunning);
    }

    // 3. Settings Modal Telemetry
    if (elements.telemetryState) {
      elements.telemetryState.textContent = isRunning ? 'ACTIVE' : 'INACTIVE (STOPPED)';
      elements.telemetryState.style.color = isRunning ? '#22c55e' : '#ef4444';
    }

    // 4. Settings Modal toggle button
    if (elements.btnToggleClockState) {
      elements.btnToggleClockState.textContent = isRunning ? '⏸ Pause Fast Clock' : '▶ Resume Fast Clock';
    }
  }

  function updateRateSelect(rate) {
    if (!elements.defaultRatio) return;
    const rateStr = String(rate);
    let match = false;
    for (let opt of elements.defaultRatio.options) {
      if (Math.abs(parseFloat(opt.value) - rate) < 0.01) {
        elements.defaultRatio.value = opt.value;
        match = true;
        break;
      }
    }
    if (!match) {
      const newOpt = document.createElement('option');
      newOpt.value = rateStr;
      newOpt.textContent = `${rate}x Fast Clock`;
      elements.defaultRatio.appendChild(newOpt);
      elements.defaultRatio.value = rateStr;
    }
  }

  function publishRateToBroker(rate) {
    if (!pahoClient || !isConnected) {
      console.log('Not connected to MQTT; rate updated locally only');
      return;
    }

    const prefix = getTopicPrefix();
    const cmdTopic = `${prefix}/cmd`;
    const rateStr = Number(rate).toFixed(2);

    try {
      // Send RATE command compatible with FastClock server & JMRI
      const cmdPayload = `RATE ${rateStr}`;
      const msg = new Paho.MQTT.Message(cmdPayload);
      msg.destinationName = cmdTopic;
      msg.qos = 0;
      pahoClient.send(msg);
      console.log(`Published to broker on ${cmdTopic}: ${cmdPayload}`);

      if (elements.connFeedback) {
        elements.connFeedback.textContent = `Pushed rate ${rateStr}x to ${cmdTopic}`;
        elements.connFeedback.style.color = '#22c55e';
      }
    } catch (err) {
      console.warn(`Failed to publish rate to ${cmdTopic}:`, err);
    }
  }

  /**
   * Intelligently parses various MQTT time formats:
   * 1. Multi-topic broker messages: {prefix}/time, {prefix}/rate, {prefix}/state, {prefix}/cmd
   * 2. Plain text time: "14:35", "14:35:20", "2:35 PM"
   * 3. JSON: {"time": "14:35:00", "rate": 4.0, "status": "running"}
   * 4. Unix epoch numbers & ISO strings
   */
  function handleMqttMessage(payloadStr, topic = '') {
    clockState.packetCount++;
    clockState.lastSyncTime = new Date();

    if (elements.footerLastSync) {
      elements.footerLastSync.textContent = clockState.lastSyncTime.toLocaleTimeString();
    }
    if (elements.footerMsgCount) {
      elements.footerMsgCount.textContent = clockState.packetCount;
    }

    const trimmed = (payloadStr || '').trim();
    if (!trimmed) return;

    const lowerTopic = (topic || '').toLowerCase();

    // 1. Dedicated rate topic: {prefix}/rate (e.g. layout/clock/rate -> "4.00")
    if (lowerTopic.endsWith('/rate')) {
      const parsedRate = parseFloat(trimmed);
      if (!isNaN(parsedRate) && parsedRate >= 0) {
        console.log(`Received rate from broker (${topic}): ${parsedRate}`);
        setClockRate(parsedRate, 'remote');
        return;
      }
    }

    // 2. Dedicated state topic: {prefix}/state (e.g. layout/clock/state -> "ACTIVE" | "INACTIVE")
    if (lowerTopic.endsWith('/state')) {
      let stateStr = trimmed.toUpperCase();
      if ((stateStr.startsWith('"') && stateStr.endsWith('"')) || (stateStr.startsWith("'") && stateStr.endsWith("'"))) {
        stateStr = stateStr.substring(1, stateStr.length - 1).trim();
      }
      if (stateStr === 'ACTIVE' || stateStr === 'RUNNING' || stateStr === 'TRUE' || stateStr === '1') {
        setClockRunning(true, 'remote');
      } else if (stateStr === 'INACTIVE' || stateStr === 'STOPPED' || stateStr === 'PAUSED' || stateStr === 'FALSE' || stateStr === '0') {
        setClockRunning(false, 'remote');
      }
      return;
    }

    // 3. Command topic: {prefix}/cmd
    if (lowerTopic.endsWith('/cmd')) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toUpperCase();
      const arg = parts[1] || '';
      if (cmd === 'RATE' && arg) {
        const r = parseFloat(arg);
        if (!isNaN(r)) setClockRate(r, 'remote');
      } else if (cmd === 'START') {
        setClockRunning(true, 'remote');
      } else if (cmd === 'STOP') {
        setClockRunning(false, 'remote');
      } else if (cmd === 'SET' && arg) {
        const d = parseTimeStringOrDate(arg);
        if (d && !isNaN(d.getTime())) applyNewTime(d);
      }
      return;
    }

    // 4. Time topic: {prefix}/time (or general JSON payload)
    let newDate = null;
    let newRate = null;
    let newRunning = null;

    // A. Try JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const data = JSON.parse(trimmed);
        if (typeof data.rate === 'number') newRate = data.rate;
        else if (typeof data.rate === 'string' && !isNaN(parseFloat(data.rate))) newRate = parseFloat(data.rate);
        if (typeof data.ratio === 'number') newRate = data.ratio;
        if (typeof data.multiplier === 'number') newRate = data.multiplier;

        if (typeof data.status === 'string') {
          newRunning = (data.status.toLowerCase() === 'running' || data.status.toLowerCase() === 'active');
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

    // Apply updates
    if (newRate !== null) {
      setClockRate(newRate, 'remote');
    }

    if (newRunning !== null) {
      setClockRunning(newRunning, 'remote');
    }

    if (newDate && !isNaN(newDate.getTime())) {
      applyNewTime(newDate);
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

    return list;
  }

  function connectMqtt(attemptIndex = 0) {
    if (isConnecting || isConnected) return;

    if (typeof Paho === 'undefined' || !Paho.MQTT || !Paho.MQTT.Client) {
      updateStatusBadge('disconnected', 'Paho Library Error');
      return;
    }

    const candidateHosts = getCandidateHosts();
    if (candidateHosts.length === 0) {
      updateStatusBadge('disconnected', 'No Host Configured');
      return;
    }

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

    // Subscribe to fast clock topics ({prefix}/time, {prefix}/rate, {prefix}/state, {prefix}/cmd)
    const prefix = getTopicPrefix();
    const userTopic = (settings.mqttTopic && settings.mqttTopic.trim()) || `${prefix}/time`;
    const topicsToSub = [];

    if (userTopic.includes('#') || userTopic.includes('+')) {
      topicsToSub.push(userTopic);
    } else {
      topicsToSub.push(userTopic);
      const timeTopic = `${prefix}/time`;
      const rateTopic = `${prefix}/rate`;
      const stateTopic = `${prefix}/state`;
      const cmdTopic = `${prefix}/cmd`;

      if (!topicsToSub.includes(timeTopic)) topicsToSub.push(timeTopic);
      if (!topicsToSub.includes(rateTopic)) topicsToSub.push(rateTopic);
      if (!topicsToSub.includes(stateTopic)) topicsToSub.push(stateTopic);
      if (!topicsToSub.includes(cmdTopic)) topicsToSub.push(cmdTopic);
    }

    topicsToSub.forEach(t => {
      try {
        pahoClient.subscribe(t, { qos: 0 });
        console.log(`Subscribed to topic: ${t} on ${activeHost}`);
      } catch (e) {
        console.error(`Subscription error on ${t}:`, e);
      }
    });

    if (elements.footerTopic) {
      elements.footerTopic.textContent = `${prefix}/(time, rate, state)`;
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

    // If there is another fallback host in the cascade (serving host):
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
    const topic = message.destinationName || '';
    const payload = message.payloadString || '';
    handleMqttMessage(payload, topic);
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
    // Theme Selector (inside modal)
    if (elements.themeSelector) {
      elements.themeSelector.addEventListener('change', (e) => {
        setTheme(e.target.value);
      });
    }

    // Auto-hide screen controls after 4s of inactivity (Tap / move wakes controls)
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(evt => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

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

    // Display View in Modal
    if (elements.defaultViewSelect) {
      elements.defaultViewSelect.addEventListener('change', (e) => {
        setViewMode(e.target.value);
      });
    }

    // Time Format in Modal
    if (elements.timeFormatSelect) {
      elements.timeFormatSelect.addEventListener('change', (e) => {
        setTimeFormat(e.target.value);
      });
    }

    // Seconds Toggle in Modal
    if (elements.showSecondsCheck) {
      elements.showSecondsCheck.addEventListener('change', (e) => {
        setSecondsDisplay(e.target.checked);
      });
    }

    // LED Color Chips in Modal
    document.querySelectorAll('.color-chip[data-color]').forEach(chip => {
      chip.addEventListener('click', () => {
        setLedColor(chip.dataset.color);
      });
    });

    // Fast Clock Ratio in Modal
    if (elements.defaultRatio) {
      elements.defaultRatio.addEventListener('change', (e) => {
        const newRate = Number(e.target.value);
        setClockRate(newRate, 'local');
      });
    }

    // Modal Toggle Fast Clock State Button (Pause / Resume)
    if (elements.btnToggleClockState) {
      elements.btnToggleClockState.addEventListener('click', () => {
        setClockRunning(!clockState.isRunning, 'local');
      });
    }

    // Stopped Indicator Icon in Top Screen Controls (opens settings modal)
    if (elements.clockStoppedBtn) {
      elements.clockStoppedBtn.addEventListener('click', openModal);
    }

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
    updateViewOptionVisibility(mode);
    saveSettings();
  }

  function updateViewOptionVisibility(mode) {
    const isDigitalActive = (mode === 'both' || mode === 'digital');
    if (elements.ledColorFormGroup) {
      elements.ledColorFormGroup.style.display = isDigitalActive ? '' : 'none';
    }
    if (elements.digitalSecondsFormGroup) {
      elements.digitalSecondsFormGroup.style.display = isDigitalActive ? '' : 'none';
    }
  }

  function setTheme(theme) {
    settings.theme = theme;
    // Replace only theme-* classes to preserve is-clock-stopped, hide-seconds, etc.
    const themes = ['theme-wood', 'theme-porcelain', 'theme-dispatcher', 'theme-modern'];
    themes.forEach(t => elements.body.classList.remove(t));
    elements.body.classList.add(theme);
    if (elements.themeSelector) elements.themeSelector.value = theme;
    saveSettings();
  }

  function setTimeFormat(fmt) {
    settings.timeFormat = fmt;
    lastDigSec = -1; // Force immediate digital display refresh
    if (elements.timeFormatSelect) elements.timeFormatSelect.value = fmt;
    saveSettings();
  }

  function setSecondsDisplay(show) {
    settings.showSeconds = !!show;
    elements.body.classList.toggle('hide-seconds', !settings.showSeconds);
    if (elements.showSecondsCheck) {
      elements.showSecondsCheck.checked = settings.showSeconds;
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
      red: { label: 'Signal Red', color: '#ff3333', glow: 'rgba(255, 51, 51, 0.55)', inactive: 'rgba(255, 51, 51, 0.08)' },
      amber: { label: 'Dispatcher Amber', color: '#ffb000', glow: 'rgba(255, 176, 0, 0.55)', inactive: 'rgba(255, 176, 0, 0.08)' },
      green: { label: 'Highball Green', color: '#2aff6b', glow: 'rgba(42, 255, 107, 0.55)', inactive: 'rgba(42, 255, 107, 0.08)' },
      blue: { label: 'Ice Blue', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', inactive: 'rgba(56, 189, 248, 0.08)' },
      white: { label: 'Cool White', color: '#f1f5f9', glow: 'rgba(241, 245, 249, 0.5)', inactive: 'rgba(241, 245, 249, 0.08)' }
    };

    const cfg = colorMap[color] || colorMap.red;
    root.style.setProperty('--led-color', cfg.color);
    root.style.setProperty('--led-glow', cfg.glow);
    root.style.setProperty('--led-inactive', cfg.inactive);

    if (elements.currentColorLabel) {
      elements.currentColorLabel.textContent = cfg.label;
    }

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

  let idleTimer = null;

  function resetIdleTimer() {
    if (elements.body) elements.body.classList.remove('user-idle');
    if (idleTimer) clearTimeout(idleTimer);
    if (elements.settingsModal && !elements.settingsModal.hasAttribute('hidden')) {
      return;
    }
    idleTimer = setTimeout(() => {
      if (elements.body) elements.body.classList.add('user-idle');
    }, 4000);
  }

  function openModal() {
    populateSettingsForm();
    elements.settingsModal.removeAttribute('hidden');
    if (elements.body) {
      elements.body.classList.add('modal-open');
      elements.body.classList.remove('user-idle');
    }
    if (idleTimer) clearTimeout(idleTimer);
  }

  function closeModal() {
    elements.settingsModal.setAttribute('hidden', '');
    if (elements.body) {
      elements.body.classList.remove('modal-open');
    }
    resetIdleTimer();
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

    if (elements.themeSelector) elements.themeSelector.value = settings.theme;
    if (elements.defaultViewSelect) elements.defaultViewSelect.value = settings.viewMode;
    updateViewOptionVisibility(settings.viewMode);
    elements.clockHandMotion.value = settings.handMotion;
    elements.timeFormatSelect.value = settings.timeFormat;
    if (elements.showSecondsCheck) elements.showSecondsCheck.checked = settings.showSeconds;
    elements.defaultRatio.value = String(settings.clockRate);
    elements.showMontgomeryNumbers.checked = settings.showMontgomery;
    elements.showCanadianInner24.checked = settings.showInner24;

    document.querySelectorAll('.color-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.color === settings.ledColor);
    });
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

    if (elements.themeSelector) settings.theme = elements.themeSelector.value;
    if (elements.defaultViewSelect) settings.viewMode = elements.defaultViewSelect.value;
    settings.handMotion = elements.clockHandMotion.value;
    settings.timeFormat = elements.timeFormatSelect.value;
    if (elements.showSecondsCheck) settings.showSeconds = elements.showSecondsCheck.checked;
    const chosenRate = Number(elements.defaultRatio.value) || 4.0;
    if (Math.abs(chosenRate - clockState.rate) > 0.01) {
      setClockRate(chosenRate, 'local');
    } else {
      settings.clockRate = chosenRate;
      clockState.rate = chosenRate;
      updateRateBadge(chosenRate);
    }

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
    setSecondsDisplay(settings.showSeconds);
    updateRateBadge(settings.clockRate);
    updateStatusIndicators();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
