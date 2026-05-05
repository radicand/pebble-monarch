const Clay = require('@rebble/clay');
const clayConfig = require('./config.json');
const monarch = require('./monarch');

const SETTINGS_KEY = 'monarch_settings_v1';
const TOKEN_KEY = 'monarch_token_v1';
const clay = new Clay(clayConfig, null, { autoHandleEvents: false });

let refreshTimer = null;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.log('Failed to parse settings:', error.message);
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function configured(settings) {
  if (!settings) {
    return false;
  }
  return Boolean(settings.email && settings.password && settings.otpSeed);
}

function toWatch(payload) {
  Pebble.sendAppMessage(payload,
    () => console.log('Sent payload to watch'),
    (error) => {
      const details = error ? error.error : undefined;
      console.log('AppMessage failed:', details);
    }
  );
}

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Maps legacy 5–120 minute slider to 6–24 h in steps of 4. */
function legacyMinutesToRefreshHours(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m)) {
    return 12;
  }
  const stepped = Math.round(m / 60 / 4) * 4;
  if (stepped === 0) {
    return 6;
  }
  return Math.max(6, Math.min(24, stepped));
}

function normalizeRefreshHours(value) {
  let hours = Number(value);
  if (!Number.isFinite(hours)) {
    hours = 12;
  }
  hours = Math.round(hours / 4) * 4;
  return Math.max(6, Math.min(24, hours));
}

function effectiveRefreshHours(settings) {
  if (settings && settings.refreshHours !== undefined && settings.refreshHours !== null) {
    return normalizeRefreshHours(settings.refreshHours);
  }
  if (settings && settings.refreshMinutes !== undefined) {
    return legacyMinutesToRefreshHours(settings.refreshMinutes);
  }
  return 12;
}

function updatedTimeText() {
  const now = new Date();
  return `Updated ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function normalizeWatchError(error) {
  if (!error) {
    return 'Sync failed';
  }

  if (!error.code) {
    return 'Sync failed';
  }

  switch (error.code) {
    case 'MFA_REQUIRED':
      return 'OTP seed required';
    case 'AUTH_FAILED':
      return 'Auth failed';
    case 'AUTH_EXPIRED':
      return 'Session expired';
    case 'NETWORK':
      return 'Network error';
    case 'API_EMPTY':
      return 'No data';
    default:
      return 'Sync failed';
  }
}

function refreshNetWorth(reason) {
  const settings = loadSettings();

  if (!configured(settings)) {
    toWatch({
      STATUS_TEXT: 'Open settings to connect',
      ERROR_TEXT: ''
    });
    return Promise.resolve();
  }

  toWatch({
    STATUS_TEXT: reason === 'manual' ? 'Refreshing...' : 'Syncing...',
    ERROR_TEXT: ''
  });

  const fetchWithToken = (token) => {
    return monarch.getNetWorth(token).then((result) => {
      const formatted = monarch.formatCurrency(result.netWorth);
      toWatch({
        NET_WORTH_TEXT: formatted,
        UPDATED_TEXT: updatedTimeText(),
        STATUS_TEXT: 'Synced',
        ERROR_TEXT: ''
      });
    });
  };

  const doLogin = () => {
    return monarch.login(settings).then((newToken) => {
      saveToken(newToken);
      return newToken;
    });
  };

  const token = loadToken();

  const run = token
    ? fetchWithToken(token).catch((error) => {
        if (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_FAILED') {
          clearToken();
          return doLogin().then(fetchWithToken);
        }
        throw error;
      })
    : doLogin().then(fetchWithToken);

  return run.catch((error) => {
    console.log('refreshNetWorth error:', error.message, error.code);
    toWatch({
      STATUS_TEXT: 'Error',
      ERROR_TEXT: normalizeWatchError(error)
    });
  });
}

function scheduleRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  const settings = loadSettings();
  const hours = effectiveRefreshHours(settings);
  const intervalMs = hours * 60 * 60 * 1000;

  refreshTimer = setInterval(() => {
    refreshNetWorth('auto');
  }, intervalMs);

  console.log('Refresh scheduled every', hours, 'hours');
}

Pebble.addEventListener('ready', () => {
  console.log('PebbleKit JS ready');
  scheduleRefresh();
  refreshNetWorth('startup');
});

Pebble.addEventListener('showConfiguration', () => {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', (event) => {
  if (!event) {
    return;
  }

  if (!event.response) {
    return;
  }

  try {
    const claySettings = clay.getSettings(event.response);
    const messageKeys = require('message_keys');

    const rawHours = claySettings[messageKeys.REFRESH_HOURS];
    const refreshHours =
      rawHours !== undefined && rawHours !== null && rawHours !== ''
        ? normalizeRefreshHours(rawHours)
        : legacyMinutesToRefreshHours(claySettings[messageKeys.REFRESH_MINUTES]);

    const settings = {
      email: claySettings[messageKeys.EMAIL] || '',
      password: claySettings[messageKeys.PASSWORD] || '',
      otpSeed: monarch.normalizeOtpSeed(claySettings[messageKeys.OTP_SEED] || ''),
      refreshHours
    };

    if (!settings.email || !settings.password || !settings.otpSeed) {
      toWatch({ STATUS_TEXT: 'Error', ERROR_TEXT: 'Email, password, and OTP seed required' });
      return;
    }

    saveSettings(settings);
    clearToken();
    scheduleRefresh();
    refreshNetWorth('config');
  } catch (error) {
    console.log('Error processing config:', error.message);
    toWatch({ STATUS_TEXT: 'Error', ERROR_TEXT: 'Config error' });
  }
});

Pebble.addEventListener('appmessage', (event) => {
  let payload = {};
  if (event) {
    if (event.payload) {
      payload = event.payload;
    }
  }
  const requested = payload.REQUEST_REFRESH || payload['REQUEST_REFRESH'] || payload[0] || payload['0'];

  if (requested) {
    refreshNetWorth('manual');
  }
});
