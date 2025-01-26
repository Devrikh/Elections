from flask import Flask, request, jsonify
from sympy import mod_inverse
import random
from flask_cors import CORS


app = Flask(__name__)

CORS(app)

# Constants for ElGamal and Shamir's Secret Sharing (p is a prime number)
p = 23  # Prime modulus
g = 5   # Generator (for ElGamal)

# Helper function for modular addition and multiplication
def mod_add(a, b, p):
    return (a + b) % p

def mod_mul(a, b, p):
    return (a * b) % p

def mod_inv(a, p):
    return mod_inverse(a, p)

# ElGamal Decryption functions
def elgamal_decrypt(c1, c2, private_key, p):
    s = pow(c1, private_key, p)
    s_inv = mod_inverse(s, p)
    m = (c2 * s_inv) % p
    return m

# Shamir's Secret Sharing - generate shares
def generate_shares(secret, num_shares, threshold, p):
    """
    Generate secret shares using Shamir's Secret Sharing.
    """
    coefficients = [secret] + [random.randint(1, p - 1) for _ in range(threshold - 1)]
    shares = []
    for i in range(1, num_shares + 1):
        y = sum(coefficients[j] * pow(i, j, p) for j in range(threshold)) % p
        shares.append((i, y))
    return shares

# Reconstruct secret using Lagrange interpolation
def reconstruct_secret(shares, p):
    """
    Reconstruct the secret from a subset of the shares using Lagrange interpolation.
    """
    secret = 0
    for i, (xi, yi) in enumerate(shares):
        li = 1
        for j, (xj, _) in enumerate(shares):
            if i != j:
                li *= (xj * mod_inv(xj - xi, p)) % p
        secret = (secret + yi * li) % p
    return secret

# Route to receive encrypted votes and decrypt them
@app.route('/api/receive-votes', methods=['POST'])
def receive_votes():
    try:
        # Receive the combined encrypted vote from the main server
        data = request.get_json()

        # Check if 'vote' is present in the received data
        if 'vote' not in data:
            return jsonify({"error": "No vote data received"}), 400
        
        encrypted_vote = data['vote']
        print("Received combined encrypted vote:", encrypted_vote)

        # Ensure 'c1' and 'c2' are integers
        if 'c1' not in encrypted_vote or 'c2' not in encrypted_vote:
            return jsonify({"error": "Missing c1 or c2 in encrypted vote"}), 400
        
        c1 = int(encrypted_vote['c1'])
        c2 = int(encrypted_vote['c2'])

        # Example: Generate secret shares and reconstruct the secret
        secret = 15  # For demonstration purposes; replace with actual secret
        shares = generate_shares(secret, 5, 3, p)  # Generate 5 shares, threshold of 3
        reconstructed_secret = reconstruct_secret(shares[:3], p)  # Reconstruct using 3 shares
        print(f"Reconstructed Secret: {reconstructed_secret}")

        # Decrypt the combined vote using the reconstructed secret
        decrypted_vote = elgamal_decrypt(c1, c2, reconstructed_secret, p)
        print(f"Decrypted Vote: {decrypted_vote}")

        # Send the decrypted vote back to the main server
        return jsonify({"decryptedVote": decrypted_vote})

    except Exception as e:
        # Handle any unexpected errors
        print(f"Error during decryption: {e}")
        return jsonify({"error": "Failed to process vote"}), 500

# Run the Flask app
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
