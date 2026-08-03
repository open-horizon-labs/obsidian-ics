// node-ical imports randomUUID from node:crypto. The plugin also supports
// Obsidian Mobile, where Node built-ins are unavailable but Web Crypto is.
// Keep the exported shape intentionally limited to the node-ical dependency.
export function randomUUID(): string {
	const webCrypto = globalThis.crypto;

	if (typeof webCrypto?.randomUUID === 'function') {
		return webCrypto.randomUUID();
	}

	if (typeof webCrypto?.getRandomValues !== 'function') {
		throw new Error('The Web Crypto API is required to parse this calendar.');
	}

	const bytes = webCrypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
		.replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
}
