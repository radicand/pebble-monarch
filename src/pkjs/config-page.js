function escape(value) {
  return String(value || '')
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

function buildConfigUrl(settings) {
  const email = escape(settings.email || '');
  const refreshMinutes = Number(settings.refreshMinutes || 30);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; color: #0f172a; }
    h2 { margin-bottom: 4px; }
    p.hint { color: #334155; font-size: 13px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #94a3b8; border-radius: 8px; margin-top: 4px; }
    .privacy { background: #f8fafc; border-left: 4px solid #0284c7; padding: 10px; margin-top: 12px; font-size: 12px; }
    .row { display: flex; gap: 8px; margin-top: 16px; }
    button { flex: 1; border: 0; border-radius: 10px; padding: 12px; font-weight: 700; }
    #save { background: #0369a1; color: #fff; }
    #cancel { background: #e2e8f0; color: #0f172a; }
  </style>
</head>
<body>
  <h2>Monarch Net Worth</h2>
  <p class="hint">Set your credentials so your watch can fetch net worth.</p>

  <label>Email</label>
  <input id="email" type="email" value="${email}" placeholder="you@example.com" />

  <label>Password</label>
  <input id="password" type="password" placeholder="Enter Monarch password" />

  <label>MFA code (optional)</label>
  <input id="mfaCode" type="text" placeholder="Current 6-digit code if required" />

  <label>Refresh interval (minutes)</label>
  <input id="refreshMinutes" type="number" min="5" max="120" value="${refreshMinutes}" />

  <div class="privacy">
    Credentials are stored on your phone for this app and sent directly to Monarch's API. They are never sent to the watch.
  </div>

  <div class="row">
    <button id="cancel" type="button">Cancel</button>
    <button id="save" type="button">Save</button>
  </div>

  <script>
    function closeWith(data) {
      var returnTo = 'pebblejs://close#' + encodeURIComponent(JSON.stringify(data || {}));
      document.location = returnTo;
    }

    document.getElementById('cancel').addEventListener('click', function() {
      closeWith({ cancelled: true });
    });

    document.getElementById('save').addEventListener('click', function() {
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      var mfaCode = document.getElementById('mfaCode').value.trim();
      var refreshMinutes = parseInt(document.getElementById('refreshMinutes').value, 10);

      if (!email) {
        alert('Email is required.');
        return;
      }

      if (!Number.isFinite(refreshMinutes) || refreshMinutes < 5 || refreshMinutes > 120) {
        alert('Refresh interval must be between 5 and 120 minutes.');
        return;
      }

      closeWith({
        email: email,
        password: password,
        mfaCode: mfaCode,
        refreshMinutes: refreshMinutes
      });
    });
  </script>
</body>
</html>`;

  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

module.exports = {
  buildConfigUrl
};
