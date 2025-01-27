const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const http = require('http');

const CONFIG = {
  CA_HOSTNAME: '192.168.89.32',
  CA_PORT: 8443,
  CA_PATH: '/sign',
  CSR_PATH: 'server.csr',
  CRT_PATH: 'server.crt',
  CA_CERT: 'myCA.pem',
  SERVER_KEY: 'server.key',
  OPENSSL_CONFIG: 'openssl.cnf',
  PUBLIC_DIR: "index.html"
};

function generateServerKeyAndCSR() {
  try {
    execSync(`openssl genpkey -algorithm RSA -out ${CONFIG.SERVER_KEY} -aes256 -pass pass:mysecurepassword`);
    execSync(`openssl req -new -key ${CONFIG.SERVER_KEY} -out ${CONFIG.CSR_PATH} -passin pass:mysecurepassword -subj "/C=IN/ST=Diu/L=Diu/O=IIITVICD/OU=CSE/CN=192.168.89.32"`);
  } catch (error) {
    process.exit(1);
  }
}

function getSignedCertificate(csrPath, callback) {
  const csr = fs.readFileSync(csrPath, 'utf-8');
  const caServerOptions = {
    hostname: CONFIG.CA_HOSTNAME,
    port: CONFIG.CA_PORT,
    path: CONFIG.CA_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-pem-file',
      'Content-Length': Buffer.byteLength(csr),
    },
    rejectUnauthorized: false,
  };

  const req = https.request(caServerOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        const { signedCert, caCert } = JSON.parse(data);
        fs.writeFileSync(CONFIG.CRT_PATH, signedCert);
        fs.writeFileSync(CONFIG.CA_CERT, caCert);
        callback(null);
      } else {
        callback(new Error(`CA server error: ${res.statusCode}`));
      }
    });
  });

  req.on('error', (err) => {
    callback(err);
  });

  req.write(csr);
  req.end();
}

if (!fs.existsSync(CONFIG.SERVER_KEY) || !fs.existsSync(CONFIG.CSR_PATH)) {
  generateServerKeyAndCSR();
}

if (!fs.existsSync(CONFIG.CRT_PATH) || !fs.existsSync(CONFIG.CA_CERT)) {
  getSignedCertificate(CONFIG.CSR_PATH, (err) => {
    if (!err) {
      startServer();
    }
  });
} else {
  startServer();
}

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(CONFIG.PUBLIC_DIR));

  function combineVotes(votes, p) {
    if (votes.length === 0) {
      throw new Error('No votes to combine.');
    }

    const combinedVote = votes.reduce(
      (acc, vote) => ({
        c1: (BigInt(acc.c1) * BigInt(vote.c1)) % BigInt(23),
        c2: (BigInt(acc.c2) * BigInt(vote.c2)) % BigInt(23),
      }),
      { c1: '1', c2: '1' }
    );

    return combinedVote;
  }

  const encryptedVotes = [];

  app.get('/api/certificate', (req, res) => {
    fs.readFile(CONFIG.CRT_PATH, 'utf-8', (err, data) => {
      if (err) {
        res.status(500).send('Error reading certificate file.');
      } else {
        res.status(200).json({ certificate: data });
      }
    });
  });

  app.get('/api/ca-cert', (req, res) => {
    fs.readFile(CONFIG.CA_CERT, 'utf-8', (err, data) => {
      if (err) {
        res.status(500).send('Error reading CA certificate file.');
      } else {
        res.status(200).json({ caCertificate: data });
      }
    });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.post('/api/vote', (req, res) => {
    try {
      const { c1, c2 } = req.body;
      if (!c1 || !c2) {
        return res.status(400).json({ error: 'Invalid vote format. Encrypted vote (c1, c2) is required.' });
      }
      encryptedVotes.push({ c1, c2 });
      res.status(200).json({ message: 'Vote received and stored successfully.' });
    } catch (error) {
      res.status(500).json({ error: 'An error occurred while processing the vote.' });
    }
  });

  let authorityResponse = null;

  app.post('/api/submit-votes', (req, res) => {
    try {
      const combinedVote = combineVotes(encryptedVotes);
      const payload = {
        vote: {
          c1: combinedVote.c1.toString(),
          c2: combinedVote.c2.toString(),
        },
      };

      const authorityOptions = {
        hostname: '192.168.89.32',
        port: 5000,
        path: '/api/receive-votes',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify(payload)),
        },
      };

      const authorityReq = http.request(authorityOptions, (authorityRes) => {
        let data = '';
        authorityRes.on('data', (chunk) => {
          data += chunk;
        });

        authorityRes.on('end', () => {
          authorityResponse = JSON.parse(data);
          res.status(200).json({
            message: 'Combined vote sent to authority successfully.',
            authorityResponse,
          });
        });
      });

      authorityReq.on('error', (err) => {
        res.status(500).json({ error: 'Failed to send combined vote to authority.' });
      });

      authorityReq.write(JSON.stringify(payload));
      authorityReq.end();
    } catch (error) {
      res.status(500).json({ error: 'Failed to combine votes.' });
    }
  });

  app.get('/api/authority-response', (req, res) => {
    if (authorityResponse) {
      res.status(200).json(authorityResponse);
    } else {
      res.status(404).json({ message: 'No response from authority yet.' });
    }
  });

  const options = {
    key: fs.readFileSync(CONFIG.SERVER_KEY, 'utf8'),
    cert: fs.readFileSync(CONFIG.CRT_PATH, 'utf8'),
    ca: fs.readFileSync(CONFIG.CA_CERT, 'utf8'),
    passphrase: 'mysecurepassword',
    requestCert: false,
    rejectUnauthorized: false,
  };

  https.createServer(options, app).listen(3000, () => {
    console.log('API server running at https://localhost:3000/');
  });
}
