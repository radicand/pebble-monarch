const API_BASE = 'https://api.monarch.com';
const DEVICE_UUID_KEY = 'monarch_device_uuid';
const OTP_STEP_SECONDS = 30;
const OTP_DIGITS = 6;

function getDeviceUUID() {
  let uuid = localStorage.getItem(DEVICE_UUID_KEY);
  if (!uuid) {
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.trunc(Math.random() * 16);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem(DEVICE_UUID_KEY, uuid);
  }
  return uuid;
}

function daysAgoISO(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}

function normalizeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeOtpSeed(seed) {
  if (!seed) {
    return '';
  }

  let normalized = String(seed).trim();
  if (!normalized) {
    return '';
  }

  if (/^otpauth:\/\//i.test(normalized)) {
    const match = /[?&]secret=([^&]+)/i.exec(normalized);
    normalized = match ? decodeURIComponent(match[1]) : '';
  }

  return normalized
    .split(/\s|-/).join('')
    .split('=').join('')
    .toUpperCase();
}

function decodeBase32(seed) {
  const normalized = normalizeOtpSeed(seed);
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw normalizeError('MFA_REQUIRED', 'OTP seed required');
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output = [];
  let i;

  for (i = 0; i < normalized.length; i += 1) {
    value = (value << 5) | alphabet.indexOf(normalized.charAt(i));
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return output;
}

function bytesToWords(bytes) {
  const words = [];
  let i;
  for (i = 0; i < bytes.length; i += 1) {
    words[i >> 2] = words[i >> 2] || 0;
    words[i >> 2] |= bytes[i] << (24 - ((i % 4) * 8));
  }
  return words;
}

function wordsToBytes(words) {
  const bytes = [];
  let i;
  for (i = 0; i < words.length * 4; i += 1) {
    bytes.push((words[i >> 2] >>> (24 - ((i % 4) * 8))) & 0xff);
  }
  return bytes;
}

function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function sha1(bytes) {
  const words = bytesToWords(bytes.slice());
  const bitLength = bytes.length * 8;
  let i;

  words[bitLength >> 5] = words[bitLength >> 5] || 0;
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  const w = [];
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t += 1) {
      if (t < 16) {
        w[t] = words[i + t] || 0;
      } else {
        w[t] = rotateLeft(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
      }
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j += 1) {
      let f;
      let k;

      if (j < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return wordsToBytes([h0, h1, h2, h3, h4]);
}

function hmacSha1(keyBytes, messageBytes) {
  const blockSize = 64;
  let workingKey = keyBytes.slice();
  let i;

  if (workingKey.length > blockSize) {
    workingKey = sha1(workingKey);
  }

  while (workingKey.length < blockSize) {
    workingKey.push(0);
  }

  const oPad = [];
  const iPad = [];
  for (i = 0; i < blockSize; i += 1) {
    oPad[i] = workingKey[i] ^ 0x5c;
    iPad[i] = workingKey[i] ^ 0x36;
  }

  return sha1(oPad.concat(sha1(iPad.concat(messageBytes))));
}

function counterBytes(counter) {
  const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
  let value = Math.floor(counter);
  let i;
  for (i = 7; i >= 0; i -= 1) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return bytes;
}

function generateOtp(seed, now) {
  const secret = decodeBase32(seed);
  const counter = Math.floor((typeof now === 'number' ? now : Date.now()) / (OTP_STEP_SECONDS * 1000));
  const digest = hmacSha1(secret, counterBytes(counter));
  const offset = digest.slice(-1)[0] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  let otp = String(binary % Math.pow(10, OTP_DIGITS));

  while (otp.length < OTP_DIGITS) {
    otp = '0' + otp;
  }

  return otp;
}

function xhrRequest(url, method, headers, body) {
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach(function (key) {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.onload = function () {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (error) {
        data = null;
      }
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, data: data });
    };
    xhr.onerror = function () {
      reject(normalizeError('NETWORK', 'Network error'));
    };
    xhr.send(body || null);
  });
}

function login(credentials) {
  const body = {
    username: credentials.email,
    password: credentials.password,
    supports_mfa: true,
    trusted_device: false
  };

  if (!credentials.otpSeed) {
    throw normalizeError('MFA_REQUIRED', 'OTP seed required');
  }

  body.totp = generateOtp(credentials.otpSeed);

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Client-Platform': 'web',
    'Device-UUID': getDeviceUUID()
  };

  return xhrRequest(`${API_BASE}/auth/login/`, 'POST', headers, JSON.stringify(body))
    .then(function (response) {
      if (response.status === 403) {
        throw normalizeError('MFA_REQUIRED', 'MFA code required');
      }

      if (!response.ok) {
        const data = response.data || {};
        const msg = data.detail || data.error_code || (response.status + ' error');
        throw normalizeError('AUTH_FAILED', msg);
      }

      const data = response.data;
      if (!(data && data.token)) {
        throw normalizeError('AUTH_FAILED', 'No token returned from login');
      }
      return data.token;
    }).catch(function (error) {
      if (error.code) {
        throw error;
      }
      throw normalizeError('NETWORK', error.message || 'Network error while logging in');
    });
}

function graphql(token, operationName, query, variables) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Client-Platform': 'web',
    'Device-UUID': getDeviceUUID(),
    'Authorization': 'Token ' + token
  };

  return xhrRequest(`${API_BASE}/graphql`, 'POST', headers, JSON.stringify({
    operationName: operationName,
    query: query,
    variables: variables
  })).then(function (response) {
    if (response.status === 401 || response.status === 403) {
      throw normalizeError('AUTH_EXPIRED', 'Session expired');
    }
    if (!response.ok) {
      throw normalizeError('NETWORK', response.status + ' error');
    }
    return response.data;
  });
}

function getNetWorth(token) {
  const query = `
    query GetAggregateSnapshots($filters: AggregateSnapshotFilters) {
      aggregateSnapshots(filters: $filters) {
        date
        balance
        __typename
      }
    }
  `;

  const variables = {
    filters: {
      startDate: daysAgoISO(31),
      endDate: new Date().toISOString().slice(0, 10)
    }
  };

  return graphql(token, 'GetAggregateSnapshots', query, variables).then((payload) => {
    if (payload.errors && payload.errors.length > 0) {
      throw normalizeError('API_ERROR', payload.errors[0].message || 'GraphQL error');
    }

    const snapshots = payload.data ? payload.data.aggregateSnapshots : undefined;
    if (!snapshots || snapshots.length === 0) {
      throw normalizeError('API_EMPTY', 'No aggregate snapshots found');
    }

    const sorted = snapshots
      .filter((item) => item && typeof item.balance === 'number' && item.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sorted.length === 0) {
      throw normalizeError('API_EMPTY', 'No valid snapshots found');
    }

    const latest = sorted[sorted.length - 1];
    return {
      netWorth: latest.balance,
      updatedDate: latest.date
    };
  });
}

function formatCurrency(amount) {
  const numeric = Number(amount || 0);
  const isNegative = numeric < 0;
  const absolute = Math.abs(numeric);

  let scaled;
  let suffix = '';
  if (absolute >= 1e9) {
    scaled = absolute / 1e9;
    suffix = 'B';
  } else if (absolute >= 1e6) {
    scaled = absolute / 1e6;
    suffix = 'M';
  } else if (absolute >= 1e3) {
    scaled = absolute / 1e3;
    suffix = 'K';
  } else {
    scaled = absolute;
  }

  const body = suffix
    ? `${scaled.toFixed(2)}${suffix}`
    : scaled.toFixed(0);

  return `${isNegative ? '-' : ''}$${body}`;
}

module.exports = {
  login,
  getNetWorth,
  formatCurrency,
  normalizeOtpSeed,
  generateOtp
};
