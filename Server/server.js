const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  CA_HOSTNAME: 'localhost', // Replace with the CA server's hostname or IP
  CA_PORT: 8443,
  CA_PATH: '/sign',
  CSR_PATH: 'server.csr',
  CRT_PATH: 'server.crt',
  CA_CERT: 'myCA.pem',
  SERVER_KEY: 'server.key',
  INDEX_FILE: 'index.html',
  OPENSSL_CONFIG: 'openssl.cnf', // Path to OpenSSL config file (if needed)
};

// Function to generate server key and CSR
function generateServerKeyAndCSR() {
  console.log('Generating server key and CSR...');
  try {
    // Generate the private key
    execSync(
      `openssl genpkey -algorithm RSA -out ${CONFIG.SERVER_KEY} -aes256 -pass pass:mysecurepassword`
    );

    // Generate the CSR
    execSync(
      `openssl req -new -key ${CONFIG.SERVER_KEY} -out ${CONFIG.CSR_PATH} -passin pass:mysecurepassword -subj "/C=US/ST=State/L=City/O=MyOrg/OU=MyUnit/CN=localhost"`
    );


    console.log('Server key and CSR generated.');
  } catch (error) {
    console.error('Error generating server key and CSR:', error);
    process.exit(1); // Exit the script if generation fails
  }
}

// Function to send CSR to the CA server and get the signed certificate
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
    rejectUnauthorized: false, // Ignore CA server certificate verification for now
  };

  const req = https.request(caServerOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('Received signed certificate and CA certificate from CA server.');
        const { signedCert, caCert } = JSON.parse(data);

        // Save the certificates locally
        fs.writeFileSync(CONFIG.CRT_PATH, signedCert);
        fs.writeFileSync(CONFIG.CA_CERT, caCert);

        callback(null);
      } else {
        console.error(`Error from CA server: ${res.statusCode}`);
        callback(new Error(`CA server error: ${res.statusCode}`));
      }
    });
  });

  req.on('error', (err) => {
    console.error('Error connecting to CA server:', err);
    callback(err);
  });

  req.write(csr);
  req.end();
}

// Ensure server key and CSR exist
if (!fs.existsSync(CONFIG.SERVER_KEY) || !fs.existsSync(CONFIG.CSR_PATH)) {
  generateServerKeyAndCSR();
}

// Check if the signed certificate exists, otherwise fetch it
if (!fs.existsSync(CONFIG.CRT_PATH) || !fs.existsSync(CONFIG.CA_CERT)) {
  console.log('Fetching signed certificate and CA certificate from CA server...');
  getSignedCertificate(CONFIG.CSR_PATH, (err) => {
    if (err) {
      console.error('Failed to get signed certificate:', err);
    } else {
      console.log('Certificates fetched successfully.');
      startServer();
    }
  });
} else {
  console.log('Signed certificate and CA certificate already exist.');
  startServer();
}

// Function to start the main server
function startServer() {
  const options = {
    key: fs.readFileSync(CONFIG.SERVER_KEY, 'utf8'),
    cert: fs.readFileSync(CONFIG.CRT_PATH, 'utf8'),
    ca: fs.readFileSync(CONFIG.CA_CERT, 'utf8'),
    passphrase: 'mysecurepassword',  // Make sure this matches the passphrase used for the key
    requestCert: false,
    rejectUnauthorized: false,
  };
  

  const server = https.createServer(options, (req, res) => {
    if (req.url === '/' && req.method === 'GET') {
      fs.readFile(CONFIG.INDEX_FILE, (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          console.error('Error reading file:', err);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found\n');
    }
  });

  server.listen(3000, () => {
    console.log(`Server running at https://localhost:3000/`);
  });
}
