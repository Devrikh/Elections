const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const http = require('http');

// Configuration
const CONFIG = {
  CA_HOSTNAME: '192.168.89.187', // Replace with the CA server's hostname or IP
  CA_PORT: 8443,
  CA_PATH: '/sign',
  CSR_PATH: 'server.csr',
  CRT_PATH: 'server.crt',
  CA_CERT: 'myCA.pem',
  SERVER_KEY: 'server.key',
  OPENSSL_CONFIG: 'openssl.cnf', // Path to OpenSSL config file (if needed)
  PUBLIC_DIR: "index.html"  // Directory for serving static files like HTML
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

// Function to start the backend API server using Express
function startServer() {
  // Create an Express application
  const app = express();

  // Middleware to parse JSON request bodies (for API requests)
  app.use(express.json());

  // Serve static files (HTML, CSS, JS) from the 'public' directory
  app.use(express.static(CONFIG.PUBLIC_DIR));


  
  // Homomorphic combination of votes
  function combineVotes(votes) {
    if (votes.length === 0) {
      throw new Error('No votes to combine.');
    }
  
    // Combine all c1 values and all c2 values homomorphically
    const combinedVote = votes.reduce(
      (acc, vote) => ({
        c1: (BigInt(acc.c1) * BigInt(vote.c1)).toString(),
        c2: (BigInt(acc.c2) * BigInt(vote.c2)).toString(),
      }),
      { c1: '1', c2: '1' } // Initial values for homomorphic multiplication
    );
  
    return combinedVote;
  }



  const encryptedVotes = [];

  // Example API route to get server certificate info (could be expanded for other routes)
  app.get('/api/certificate', (req, res) => {
    fs.readFile(CONFIG.CRT_PATH, 'utf-8', (err, data) => {
      if (err) {
        res.status(500).send('Error reading certificate file.');
        console.error('Error reading certificate file:', err);
      } else {
        res.status(200).json({ certificate: data });
      }
    });
  });

  // Example API route to get CA certificate info
  app.get('/api/ca-cert', (req, res) => {
    fs.readFile(CONFIG.CA_CERT, 'utf-8', (err, data) => {
      if (err) {
        res.status(500).send('Error reading CA certificate file.');
        console.error('Error reading CA certificate file:', err);
      } else {
        res.status(200).json({ caCertificate: data });
      }
    });
  });

  // Route to render HTML page (index.html)
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });




  // Route to receive encrypted votes
  app.post('/api/vote', (req, res) => {
    try {
      const { c1, c2 } = req.body;
  
      // Validate the encrypted vote
      if (!c1 || !c2) {
        return res.status(400).json({ error: 'Invalid vote format. Encrypted vote (c1, c2) is required.' });
      }
  
      // Store the encrypted vote
      encryptedVotes.push({ c1, c2 });
      console.log('Encrypted vote stored:', { c1, c2 });
  
      res.status(200).json({ message: 'Vote received and stored successfully.' });
    } catch (error) {
      console.error('Error storing vote:', error);
      res.status(500).json({ error: 'An error occurred while processing the vote.' });
    }
  });
  
  
  // Route to combine votes and send to authority
// Store the authority response
let authorityResponse = null;

app.post('/api/submit-votes', (req, res) => {
  try {
    console.log('Combining votes...');
    const combinedVote = combineVotes(encryptedVotes); // Assuming this returns an object like { c1: 1440, c2: 4212 }

    console.log('Combined vote:', combinedVote);

    // Wrap the combined vote in the required structure
    const payload = {
      vote: combinedVote, // Ensures { vote: { c1: ..., c2: ... } }
    };

    // Send the combined vote to authority.py
    const authorityOptions = {
      hostname: '192.168.89.32', // Replace with authority.py hostname
      port: 5000,
      path: '/api/receive-votes',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(payload)), // Ensure proper Content-Length
      },
    };

    const authorityReq = http.request(authorityOptions, (authorityRes) => { // Use http.request here
      let data = '';
      authorityRes.on('data', (chunk) => {
        data += chunk;
      });

      authorityRes.on('end', () => {
        console.log('Response from authority:', data);

        // Save the response for later use
        const authorityResponse = JSON.parse(data);

        // Send a success response to the client
        res.status(200).json({
          message: 'Combined vote sent to authority successfully.',
          authorityResponse, // Include the response from authority
        });
      });
    });

    authorityReq.on('error', (err) => {
      console.error('Error sending combined vote to authority:', err);
      res.status(500).json({ error: 'Failed to send combined vote to authority.' });
    });

    // Write the payload to the request body
    authorityReq.write(JSON.stringify(payload));
    authorityReq.end();
  } catch (error) {
    console.error('Error combining votes:', error);
    res.status(500).json({ error: 'Failed to combine votes.' });
  }
});




// API to fetch the latest response from authority
app.get('/api/authority-response', (req, res) => {
  if (authorityResponse) {
    res.status(200).json(authorityResponse);
  } else {
    res.status(404).json({ message: 'No response from authority yet.' });
  }
});












  // Options for HTTPS server
  const options = {
    key: fs.readFileSync(CONFIG.SERVER_KEY, 'utf8'),
    cert: fs.readFileSync(CONFIG.CRT_PATH, 'utf8'),
    ca: fs.readFileSync(CONFIG.CA_CERT, 'utf8'),
    passphrase: 'mysecurepassword',  // Make sure this matches the passphrase used for the key
    requestCert: false,
    rejectUnauthorized: false,
  };

  // Create an HTTPS server using Express
  https.createServer(options, app).listen(3000, () => {
    console.log('API server running at https://localhost:3000/');
  });
}
