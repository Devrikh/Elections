const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const CA_KEY = 'myCA.key';
const CA_CERT = 'myCA.pem';
const CA_SERIAL = 'myCA.srl';
const CONFIG_FILE = 'openssl.cnf'; // OpenSSL configuration file

const Options = {
  key: fs.existsSync(CA_KEY) ? fs.readFileSync(CA_KEY) : null,
  cert: fs.existsSync(CA_CERT) ? fs.readFileSync(CA_CERT) : null,
  passphrase: 'hello', // Replace with your passphrase
};

// Ensure OpenSSL configuration file exists
if (!fs.existsSync(CONFIG_FILE)) {
  console.error(`Missing configuration file: ${CONFIG_FILE}`);
  process.exit(1);
}

// Ensure CA private key and certificate exist
if (!fs.existsSync(CA_KEY)) {
  console.log('Generating CA private key...');
  execSync(`openssl genrsa -des3 -out ${CA_KEY} 2048`, { stdio: 'inherit' });
  console.log('CA private key generated.');
}

if (!fs.existsSync(CA_CERT)) {
  console.log('Generating CA certificate...');
  execSync(
    `openssl req -x509 -new -nodes -key ${CA_KEY} -sha256 -days 3650 -out ${CA_CERT} -config ${CONFIG_FILE} -extensions v3_ca`,
    { stdio: 'inherit' }
  );
  console.log('CA certificate generated.');
}

// Create an HTTPS server for signing CSRs
const server = https.createServer(
  Options,
  (req, res) => {
    if (req.method === 'POST' && req.url === '/sign') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const csrPath = 'request.csr';
          const signedCertPath = 'signed-cert.crt';

          // Save the CSR to a temporary file
          fs.writeFileSync(csrPath, body);

          // Sign the CSR with the CA's private key and certificate
          execSync(
            `openssl x509 -req -in ${csrPath} -CA ${CA_CERT} -CAkey ${CA_KEY} -CAcreateserial -out ${signedCertPath} -days 365 -sha256 -extfile ${CONFIG_FILE} -extensions v3_ca`,
            { stdio: 'inherit' }
          );

          // Read the signed certificate and CA certificate
          const signedCert = fs.readFileSync(signedCertPath, 'utf8');
          const caCert = fs.readFileSync(CA_CERT, 'utf8');

          // Respond with the signed certificate and CA certificate
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ signedCert, caCert }));

          // Clean up temporary files
          fs.unlinkSync(csrPath);
          fs.unlinkSync(signedCertPath);
        } catch (error) {
          console.error('Error signing CSR:', error);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error signing CSR');
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
);

// Start the CA server
const PORT = 8443;
server.listen(PORT, () => {
  console.log(`CA server running at https://localhost:${PORT}`);
});
