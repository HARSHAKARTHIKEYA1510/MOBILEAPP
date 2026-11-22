const os = require('os');

function getMacLanIp() {
  const interfaces = os.networkInterfaces();
  const preferredOrder = ['en0', 'en1', 'en2'];

  for (const name of preferredOrder) {
    const entries = interfaces[name] || [];
    for (const iface of entries) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  for (const entries of Object.values(interfaces)) {
    for (const iface of entries || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return null;
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    detectedHost: getMacLanIp(),
    apiPort: 3001,
  },
});
