import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function encryption(data: Buffer, key: Buffer, iv: Buffer = crypto.randomBytes(16)) {
	let cipher = crypto.createCipheriv(ALGO, key, iv);
	let encrypted = cipher.update(data);
	encrypted = Buffer.concat([iv, encrypted, cipher.final()]);
	return encrypted;
}

function decryption(encrypted: Buffer, key: Buffer) {
	try {
		let iv = encrypted.subarray(0, 16);
		let decipher = crypto.createDecipheriv(ALGO, key, iv);
		let decrypted = decipher.update(encrypted.subarray(16));
		return Buffer.concat([decrypted, decipher.final()]);
	}
	catch (e) {
		return false;
	}

}

export { encryption, decryption }
