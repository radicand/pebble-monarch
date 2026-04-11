const monarch = require('./monarch');
const configPage = require('./config-page');

const SETTINGS_KEY = 'monarch_settings_v1';
const TOKEN_KEY = 'monarch_token_v1';

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
  return Boolean(settings.email && settings.password);
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
      return 'MFA code required';
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
  const minutes = Math.max(5, Math.min(120, Number(settings.refreshMinutes || 30)));
  const intervalMs = minutes * 60 * 1000;

  refreshTimer = setInterval(() => {
    refreshNetWorth('auto');
  }, intervalMs);

  console.log('Refresh scheduled every', minutes, 'minutes');
}

Pebble.addEventListener('ready', () => {
  console.log('PebbleKit JS ready');
  scheduleRefresh();
  refreshNetWorth('startup');
});

Pebble.addEventListener('showConfiguration', () => {
  const settings = loadSettings();
  Pebble.openURL(configPage.buildConfigUrl(settings));
});

Pebble.addEventListener('webviewclosed', (event) => {
  if (!event) {
    return;
  }

  if (!event.response) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(event.response));
  } catch (error) {
    console.log('Invalid config response:', error.message);
    toWatch({ STATUS_TEXT: 'Error', ERROR_TEXT: 'Bad config data' });
    return;
  }

  if (parsed.cancelled) {
    return;
  }

  const current = loadSettings();
  const merged = {
    email: parsed.email || current.email || '',
    password: parsed.password || current.password || '',
    mfaCode: parsed.mfaCode || '',
    refreshMinutes: Number(parsed.refreshMinutes || current.refreshMinutes || 30)
  };

  if (!merged.email || !merged.password) {
    toWatch({ STATUS_TEXT: 'Error', ERROR_TEXT: 'Email and password required' });
    return;
  }

  saveSettings(merged);
  clearToken();
  scheduleRefresh();
  refreshNetWorth('config');
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
