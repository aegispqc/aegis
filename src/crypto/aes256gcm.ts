import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function encryption(data: Buffer, key: Buffer, iv: Buffer = crypto.randomBytes(12)): Buffer {
	let cipher = crypto.createCipheriv(ALGO, key, iv);
	let encrypted = cipher.update(data);
	let final = cipher.final();
	let authTag = cipher.getAuthTag();
	encrypted = Buffer.concat([iv, authTag, encrypted, final]);
	return encrypted;
}

function decryption(encrypted: Buffer, key: Buffer): Buffer | undefined {
	try {
		let iv = encrypted.subarray(0, 12);
		let authTag = encrypted.subarray(12, 28);
		let encryptedData = encrypted.subarray(28);
		let decipher = crypto.createDecipheriv(ALGO, key, iv);
		decipher.setAuthTag(authTag);
		let decrypted = decipher.update(encryptedData);
		return Buffer.concat([decrypted, decipher.final()]);
	}
	catch (e) {
		console.log(e);
		return;
	}

}

export { encryption, decryption }