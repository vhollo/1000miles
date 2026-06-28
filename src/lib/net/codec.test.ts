import { describe, it, expect } from 'vitest';
import { decode, encode, extractCode } from './codec';

describe('codec', () => {
	it('round-trips arbitrary objects and is URL-safe', async () => {
		const obj = {
			type: 'offer',
			sdp: 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\na=group:BUNDLE 0\r\n',
			n: 42,
			arr: [1, 2, 3]
		};
		const code = await encode(obj);
		expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: no + / =
		expect(await decode(code)).toEqual(obj);
	});

	it('compresses repetitive SDP smaller than the raw text', async () => {
		const sdp = 'a=candidate:1 1 udp 2122 192.168.0.5 50000 typ host\r\n'.repeat(40);
		const code = await encode({ type: 'answer', sdp });
		expect(code.length).toBeLessThan(sdp.length);
	});

	it('extractCode reads raw codes, links and fragments', () => {
		expect(extractCode('ABC123')).toBe('ABC123');
		expect(extractCode('  ABC123  ')).toBe('ABC123');
		expect(extractCode('https://miles.app/online#j=ABC123')).toBe('ABC123');
		expect(extractCode('http://localhost:5173/online#a=Zz-_9x')).toBe('Zz-_9x');
		expect(extractCode('#j=fromhash')).toBe('fromhash');
	});

	it('decode accepts a pasted link, not just a bare code', async () => {
		const code = await encode({ hello: 'world' });
		expect(await decode(`https://miles.app/online#a=${code}`)).toEqual({ hello: 'world' });
	});
});
