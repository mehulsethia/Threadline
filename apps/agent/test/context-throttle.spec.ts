import { describe, expect, it } from "bun:test";
import { APIError } from "context.dev/core/error";
import { throttled } from "../agent/lib/context-dev";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Context.dev throttle", () => {
	it("never runs more than one request at a time", async () => {
		let running = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 4 }, () =>
				throttled(async () => {
					running += 1;
					peak = Math.max(peak, running);
					await sleep(20);
					running -= 1;
				}),
			),
		);
		expect(peak).toBe(1);
	});

	it("waits as long as Retry-After asks, then tries again", async () => {
		let calls = 0;
		const started = Date.now();
		const result = await throttled(async () => {
			calls += 1;
			if (calls === 1) {
				throw APIError.generate(
					429,
					{},
					"rate limited",
					new Headers({ "retry-after": "0.2" }),
				);
			}
			return "ok";
		});
		expect(result).toBe("ok");
		expect(calls).toBe(2);
		expect(Date.now() - started).toBeGreaterThanOrEqual(200);
	});

	it("does not retry an error that is not a rate limit", async () => {
		let calls = 0;
		await expect(
			throttled(async () => {
				calls += 1;
				throw APIError.generate(401, {}, "bad key", new Headers());
			}),
		).rejects.toBeInstanceOf(APIError);
		expect(calls).toBe(1);
	});
});
