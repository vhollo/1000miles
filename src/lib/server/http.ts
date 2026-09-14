/** Small helpers shared by the API endpoints. */

/** Parse a JSON body, treating anything unreadable as an empty object. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body: unknown = await request.json();
		return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export const str = (v: unknown): string | null =>
	typeof v === 'string' && v.length > 0 ? v : null;
