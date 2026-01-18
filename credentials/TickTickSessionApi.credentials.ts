import type {
	Icon,
	IAuthenticateGeneric,
	ICredentialType,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INodeProperties,
	ICredentialDataDecryptedObject,
	IDataObject,
} from "n8n-workflow";
import * as crypto from "crypto";

const V2_API_BASE = "https://api.ticktick.com/api/v2";
const DEFAULT_V2_USER_AGENT = "Mozilla/5.0 (rv:145.0) Firefox/145.0";
const DEFAULT_V2_DEVICE_VERSION = 6430;
const SESSION_TTL_MS = 23 * 60 * 60 * 1000;

interface SessionCache {
	token: string;
	deviceId: string;
	expiresAt: number;
}

const sessionCache = new Map<string, SessionCache>();

function toPythonStyleJson(obj: object): string {
	return JSON.stringify(obj, null, 0).replace(/,/g, ", ").replace(/:/g, ": ");
}

function generateDeviceId(): string {
	const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
	const random = crypto.randomBytes(8).toString("hex");
	return timestamp + random;
}

function buildDeviceHeader(
	deviceId: string,
	deviceVersion: number = DEFAULT_V2_DEVICE_VERSION,
): string {
	return toPythonStyleJson({
		platform: "web",
		version: deviceVersion,
		id: deviceId,
	});
}

function extractCookies(
	setCookieHeaders: string | string[],
): Record<string, string> {
	const cookies: Record<string, string> = {};
	const cookieArray = Array.isArray(setCookieHeaders)
		? setCookieHeaders
		: [setCookieHeaders];

	for (const cookieHeader of cookieArray) {
		const match = cookieHeader.match(/^([^=]+)=([^;]+)/);
		if (match) {
			const [, name, value] = match;
			if (
				value && value !== '""' &&
				!cookieHeader.includes("Expires=Thu, 01 Jan 1970")
			) {
				cookies[name] = value;
			}
		}
	}

	return cookies;
}

export class TickTickSessionApi implements ICredentialType {
	name = "tickTickSessionApi";
	displayName = "TickTick (V2) Session API";
	documentationUrl = "https://github.com/hansdoebel/n8n-nodes-ticktick";
	icon: Icon = "file:../icons/ticktick.svg";
	properties: INodeProperties[] = [
		{
			displayName: "Email",
			name: "username",
			type: "string",
			default: "",
			required: true,
			description: "Your TickTick account email",
		},
		{
			displayName: "Password",
			name: "password",
			type: "string",
			typeOptions: {
				password: true,
			},
			default: "",
			required: true,
			description: "Your TickTick account password",
		},
		{
			displayName:
				"Session auth uses TickTick's unofficial V2 API. Credential testing is disabled; validation happens when used in a workflow. 2FA is not supported.",
			name: "notice",
			type: "notice",
			default: "",
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: "generic",
		properties: {
			headers: {
				"User-Agent": DEFAULT_V2_USER_AGENT,
			},
		},
	};

	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const username = credentials.username as string;
		const password = credentials.password as string;
		const userAgent = DEFAULT_V2_USER_AGENT;
		const deviceVersion = DEFAULT_V2_DEVICE_VERSION;

		// Check cache
		let cached = sessionCache.get(username);
		if (cached && cached.expiresAt > Date.now()) {
			return {
				headers: {
					"User-Agent": userAgent,
					"X-Device": buildDeviceHeader(cached.deviceId, deviceVersion),
					Cookie: `t=${cached.token}`,
				},
			};
		}

		// Generate or reuse device ID
		const deviceId = cached?.deviceId || generateDeviceId();

		// Authenticate
		const bodyJson = toPythonStyleJson({ username, password });
		const signonResponse = await this.helpers.httpRequest({
			method: "POST",
			url: `${V2_API_BASE}/user/signon?wc=true&remember=true`,
			headers: {
				"Accept-Encoding": "identity",
				"User-Agent": userAgent,
				"Content-Type": "application/json",
				"X-Device": buildDeviceHeader(deviceId, deviceVersion),
			},
			body: bodyJson,
			returnFullResponse: true,
		});

		const responseBody = typeof signonResponse.body === "string"
			? JSON.parse(signonResponse.body)
			: signonResponse.body;

		if (responseBody.authId && !responseBody.token) {
			throw new Error(
				"Two-factor authentication is required but not supported. Please disable 2FA or use a different authentication method.",
			);
		}

		let token = responseBody.token;
		if (!token) {
			const cookies = signonResponse.headers?.["set-cookie"];
			if (cookies) {
				const authCookies = extractCookies(cookies);
				token = authCookies.t;
			}
		}

		if (!token) {
			throw new Error(
				`Failed to obtain session token from TickTick. ${
					responseBody.errorMessage || "Please check your credentials."
				}`,
			);
		}

		// Cache the session
		sessionCache.set(username, {
			token,
			deviceId,
			expiresAt: Date.now() + SESSION_TTL_MS,
		});

		return {
			headers: {
				"User-Agent": userAgent,
				"X-Device": buildDeviceHeader(deviceId, deviceVersion),
				Cookie: `t=${token}`,
			},
		};
	}
}
