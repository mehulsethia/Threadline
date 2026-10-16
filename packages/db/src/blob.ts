import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { isMirrored } from "./images";
import { safeFetch } from "./safe-fetch";

export { isMirrored, isOptimizable } from "./images";

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

type ExtensionByMediaType = Record<string, string>;

const ALLOWED: ExtensionByMediaType = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/avif": "avif",
	"image/svg+xml": "svg",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

let storagePromise: Promise<Storage> | null = null;

async function getStorageClient(): Promise<Storage> {
	if (storagePromise) return storagePromise;

	storagePromise = (async () => {
		const projectId =
			process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
		const googleAuth = new GoogleAuth({
			projectId,
			scopes: ["https://www.googleapis.com/auth/cloud-platform"],
		});

		// On Cloud Run the service's own identity signs URLs (through the IAM
		// signBlob API), so no impersonation is needed or allowed.
		if (process.env.K_SERVICE) {
			return new Storage({ projectId });
		}

		const client = await googleAuth.getClient();
		if ("client_email" in client && typeof client.client_email === "string") {
			return new Storage({ projectId, authClient: client });
		}

		// Local user credentials cannot sign URLs; borrow a service account.

		const targetPrincipal =
			process.env.GCS_SERVICE_ACCOUNT ||
			"358743112898-compute@developer.gserviceaccount.com";

		const impersonatedClient = new Impersonated({
			sourceClient: client,
			targetPrincipal,
			targetScopes: [
				"https://www.googleapis.com/auth/cloud-platform",
				"https://www.googleapis.com/auth/devstorage.read_write",
			],
			lifetime: 3600,
		});

		return new Storage({ projectId, authClient: impersonatedClient });
	})();

	return storagePromise;
}

export function blobEnabled(): boolean {
	return Boolean(process.env.GCS_BUCKET?.trim());
}

export async function uploadFile(
	destination: string,
	bytes: Buffer | Uint8Array,
	contentType?: string,
): Promise<string> {
	const bucketName = process.env.GCS_BUCKET;
	if (!bucketName) {
		throw new Error("GCS_BUCKET is not set");
	}

	const storage = await getStorageClient();
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(destination);

	await file.save(Buffer.from(bytes), {
		contentType,
		resumable: false,
		metadata: contentType ? { contentType } : undefined,
	});

	const [signedUrl] = await file.getSignedUrl({
		action: "read",
		expires: Date.now() + SIGNED_URL_TTL_MS,
		version: "v4",
	});

	return signedUrl;
}

export async function getSignedUrl(
	destination: string,
	expiresInMinutes = 60,
): Promise<string> {
	const bucketName = process.env.GCS_BUCKET;
	if (!bucketName) {
		throw new Error("GCS_BUCKET is not set");
	}

	const storage = await getStorageClient();
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(destination);

	const [signedUrl] = await file.getSignedUrl({
		action: "read",
		expires: Date.now() + expiresInMinutes * 60 * 1000,
		version: "v4",
	});

	return signedUrl;
}

export async function downloadFile(destination: string): Promise<Buffer> {
	const bucketName = process.env.GCS_BUCKET;
	if (!bucketName) {
		throw new Error("GCS_BUCKET is not set");
	}

	const storage = await getStorageClient();
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(destination);

	const [contents] = await file.download();
	return contents;
}

export async function mirror(
	sourceUrl: string,
	prefix: string,
): Promise<string | null> {
	if (!blobEnabled()) return null;
	if (isMirrored(sourceUrl)) return sourceUrl;

	try {
		const result = await safeFetch(sourceUrl, { timeoutMs: TIMEOUT_MS });
		if (!result?.response.ok) return null;

		const { response } = result;
		const type = response.headers.get("content-type")?.split(";")[0]?.trim();
		const extension = type ? ALLOWED[type.toLowerCase()] : undefined;
		if (!type || !extension) return null;

		const bytes = await readCapped(response);
		if (!bytes) return null;

		const digest = createHash("sha256")
			.update(bytes)
			.digest("hex")
			.slice(0, 12);

		const filename = `${prefix}-${digest}.${extension}`;
		return await uploadFile(filename, bytes, type);
	} catch {
		return null;
	}
}

async function readCapped(response: Response): Promise<Buffer | null> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_BYTES) {
		await response.body?.cancel();
		return null;
	}

	if (!response.body) return null;

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	try {
		while (size <= MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			chunks.push(value);
		}
	} catch {
		return null;
	} finally {
		await reader.cancel().catch(() => {});
	}

	if (size === 0 || size > MAX_BYTES) return null;
	return Buffer.concat(chunks);
}
