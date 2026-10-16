import { defaultBackend, defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

// Cloud Run (K_SERVICE is set there) cannot boot the microsandbox VM or reach
// a Docker daemon, so the agent uses the in-process just-bash shell there.
// Elsewhere the framework picks the strongest isolation the host supports.
const onCloudRun = Boolean(process.env.K_SERVICE);

export default defineSandbox({
	backend: onCloudRun
		? justbash()
		: defaultBackend({
				vercel: { networkPolicy: "deny-all" },
				docker: { networkPolicy: "deny-all" },
				microsandbox: { networkPolicy: "deny-all" },
			}),
});
