const API_BASE = 'https://api.monarchmoney.com';

function jsonOrEmpty(response) {
  return response
    .json()
    .catch(() => ({}));
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

function login(credentials) {
  const body = {
    username: credentials.email,
    password: credentials.password,
    supports_mfa: true,
    trusted_device: false
  };

  if (credentials.mfaCode) {
    body.totp = credentials.mfaCode;
  }

  return fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Client-Platform': 'web'
    },
    body: JSON.stringify(body)
  }).then((response) => {
    if (response.status === 403) {
      throw normalizeError('MFA_REQUIRED', 'MFA code required');
    }

    if (!response.ok) {
      return jsonOrEmpty(response).then((data) => {
        const msg = data.detail || data.error_code || `${response.status} ${response.statusText}`;
        throw normalizeError('AUTH_FAILED', msg);
      });
    }

    return response.json().then((data) => {
      if (!data || !data.token) {
        throw normalizeError('AUTH_FAILED', 'No token returned from login');
      }
      return data.token;
    });
  }).catch((error) => {
    if (error.code) {
      throw error;
    }
    throw normalizeError('NETWORK', error.message || 'Network error while logging in');
  });
}

function graphql(token, operationName, query, variables) {
  return fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Client-Platform': 'web',
      'Authorization': `Token ${token}`
    },
    body: JSON.stringify({
      operationName,
      query,
      variables
    })
  }).then((response) => {
    if (response.status === 401 || response.status === 403) {
      throw normalizeError('AUTH_EXPIRED', 'Session expired');
    }
    if (!response.ok) {
      throw normalizeError('NETWORK', `${response.status} ${response.statusText}`);
    }
    return response.json();
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

    const snapshots = payload.data && payload.data.aggregateSnapshots;
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
  const formatted = absolute.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${isNegative ? '-' : ''}$${formatted}`;
}

module.exports = {
  login,
  getNetWorth,
  formatCurrency
};
