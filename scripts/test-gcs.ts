import "../packages/env/src/load.ts";

import {
	downloadFile,
	getSignedUrl,
	uploadFile,
} from "../packages/db/src/blob.ts";

async function main(): Promise<void> {
	const bucket = process.env.GCS_BUCKET;
	console.log(`[Testing GCS Bucket]: ${bucket}`);

	const filename = `test-verify-${Date.now()}.txt`;
	const testPayload = `Threadline GCS verification: ${new Date().toISOString()}`;
	const bytes = Buffer.from(testPayload, "utf-8");

	console.log(`[Uploading]: ${filename}`);
	const signedUrl = await uploadFile(filename, bytes, "text/plain");
	console.log(`[Signed URL generated]: ${signedUrl}`);

	console.log(`[Fetching signed URL via HTTP]...`);
	const response = await fetch(signedUrl);
	if (!response.ok) {
		throw new Error(
			`HTTP fetch failed with status ${response.status}: ${await response.text()}`,
		);
	}
	const fetchedText = await response.text();
	console.log(`[Fetched Content]: ${fetchedText}`);

	if (fetchedText !== testPayload) {
		throw new Error(
			`Payload mismatch: expected "${testPayload}", received "${fetchedText}"`,
		);
	}

	console.log(`[Downloading via SDK downloadFile]...`);
	const downloadedBytes = await downloadFile(filename);
	const downloadedText = downloadedBytes.toString("utf-8");
	console.log(`[Downloaded Content]: ${downloadedText}`);

	if (downloadedText !== testPayload) {
		throw new Error(`Payload mismatch via downloadFile`);
	}

	console.log(`\n=== GCS Storage Verification PASSED ===`);
}

main().catch((error) => {
	console.error("GCS Verification Failed:", error);
	process.exit(1);
});
