const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");

const CA_KEY = "myCA.key";
const CA_CERT = "myCA.pem";
const CA_SERIAL = "myCA.srl";
const CONFIG_FILE = "openssl.cnf";

const Options = {
  key: fs.existsSync(CA_KEY) ? fs.readFileSync(CA_KEY) : null,
  cert: fs.existsSync(CA_CERT) ? fs.readFileSync(CA_CERT) : null,
  passphrase: "mysecurepassword",
};

if (!fs.existsSync(CA_KEY)) {
  execSync(
    `openssl genpkey -algorithm RSA -out ${CA_KEY} -aes256 -pass pass:mysecurepassword`
  );
}

if (!fs.existsSync(CA_CERT)) {
  execSync(
    `openssl req -key ${CA_KEY} -new -x509 -out ${CA_CERT} -days 3650 -passin pass:mysecurepassword -subj "/C=IN/ST=Diu/L=Diu/O=IIITVICD/OU=CSE/CN=192.168.89.32"`
  );
}

const server = https.createServer(Options, (req, res) => {
  if (req.method === "POST" && req.url === "/sign") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const csrPath = "request.csr";
        const signedCertPath = "signed-cert.crt";

        fs.writeFileSync(csrPath, body);

        execSync(
          `openssl x509 -req -in ${csrPath} -CA ${CA_CERT} -CAkey ${CA_KEY} -CAcreateserial -out ${signedCertPath} -days 365 -passin pass:mysecurepassword`
        );

        const signedCert = fs.readFileSync(signedCertPath, "utf8");
        const caCert = fs.readFileSync(CA_CERT, "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ signedCert, caCert }));

        fs.unlinkSync(csrPath);
        fs.unlinkSync(signedCertPath);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error signing CSR");
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

const PORT = 8443;
server.listen(PORT, () => {
  console.log(`CA server running at https://localhost:${PORT}`);
});
