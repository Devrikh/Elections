from flask import Flask, request, jsonify
from sympy import mod_inverse
import random
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

p = 23
g = 5

def mod_add(a, b, p):
    return (a + b) % p

def mod_mul(a, b, p):
    return (a * b) % p

def mod_inv(a, p):
    try:
        return mod_inverse(a, p)
    except ValueError:
        return None

def elgamal_decrypt(c1, c2, private_key, p):
    s = pow(c1, private_key, p)
    s_inv = mod_inv(s, p)
    if s_inv is None:
        raise ValueError("Modular inverse does not exist.")
    m = (c2 * s_inv) % p
    return m

def generate_shares(secret, num_shares, threshold, p):
    coefficients = [secret] + [random.randint(1, p - 1) for _ in range(threshold - 1)]
    shares = []
    for i in range(1, num_shares + 1):
        y = sum(coefficients[j] * pow(i, j, p) for j in range(threshold)) % p
        shares.append((i, y))
    return shares

def reconstruct_secret(shares, p):
    secret = 0
    for i, (xi, yi) in enumerate(shares):
        li = 1
        for j, (xj, _) in enumerate(shares):
            if i != j:
                li = li * xj * mod_inv(xj - xi, p) % p
        secret = (secret + yi * li) % p
    return secret

@app.route('/api/receive-votes', methods=['POST'])
def receive_votes():
    try:
        data = request.get_json()
        if 'vote' not in data:
            return jsonify({"error": "No vote data received"}), 400
        encrypted_vote = data['vote']
        if 'c1' not in encrypted_vote or 'c2' not in encrypted_vote:
            return jsonify({"error": "Missing c1 or c2 in encrypted vote"}), 400
        c1 = int(encrypted_vote['c1'])
        c2 = int(encrypted_vote['c2'])
        secret = 15
        shares = generate_shares(secret, 5, 3, p)
        reconstructed_secret = reconstruct_secret(shares[:3], p)
        decrypted_vote = elgamal_decrypt(c1, c2, reconstructed_secret, p)
        d = decrypted_vote if decrypted_vote <= p // 2 else decrypted_vote - p
        if d == 0:
            result = "The vote is tied!"
        elif d > 0:
            result = f"Party A wins by {d} votes"
        else:
            result = f"Party B wins by {abs(d)} votes"
        return jsonify({"decryptedVote": d, "result": result})
    except Exception as e:
        return jsonify({"error": "Failed to process vote", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
