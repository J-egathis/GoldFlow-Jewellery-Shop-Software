const os = require('os');

function getPrimaryLanIp() {
  const nets = os.networkInterfaces();
  const candidateIps = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const isVirtual = /virtual|vethernet|hyper-v|wsl|loopback|docker/i.test(name);
        candidateIps.push({
          name,
          address: net.address,
          priority: isVirtual ? 1 : (/wi-?fi|ethernet|en0|eth0|local/i.test(name) ? 3 : 2)
        });
      }
    }
  }

  candidateIps.sort((a, b) => b.priority - a.priority);
  return candidateIps.length > 0 ? candidateIps[0].address : 'localhost';
}

function getLanServerUrl(req) {
  const lanIp = getPrimaryLanIp();
  const defaultPort = process.env.PORT || 3000;

  if (req) {
    const rawHost = req.get('host') || '';
    const protocol = req.protocol || 'http';

    if (rawHost && !rawHost.startsWith('localhost') && !rawHost.startsWith('127.0.0.1')) {
      return `${protocol}://${rawHost}`;
    }

    const hostPort = rawHost.includes(':') ? rawHost.split(':')[1] : defaultPort;
    return `${protocol}://${lanIp}:${hostPort}`;
  }

  return `http://${lanIp}:${defaultPort}`;
}

module.exports = {
  getPrimaryLanIp,
  getLanServerUrl
};
