#!/usr/bin/env bash
# Deploys Threadline to Cloud Run from images already pushed by
# deploy/cloudbuild.yaml. Idempotent; re-run after every build.
#
#   TAG=$(git rev-parse --short HEAD) deploy/deploy.sh [migrate|services|scheduler|purge|all]
#
# Topology: the browser only talks to the app's origin. The app proxies /api/*
# to the API (so Better Auth cookies and OAuth callbacks live on one origin);
# the voice WebSocket goes straight to the API's own URL with a one-minute
# ticket. The agent is IAM-only and woken by the API.
set -euo pipefail

PROJECT="${PROJECT:-project-e705af63-271f-48bf-92f}"
REGION="${REGION:-us-central1}"
TAG="${TAG:?set TAG to the image tag}"
STEP="${1:-all}"

PN="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
REG="$REGION-docker.pkg.dev/$PROJECT/threadline"
SQL="$PROJECT:$REGION:threadline-postgres"
SA() { echo "threadline-$1-sa@$PROJECT.iam.gserviceaccount.com"; }

APP_URL="https://threadline-app-$PN.$REGION.run.app"
API_RUN_URL="https://threadline-api-$PN.$REGION.run.app"
AGENT_URL="https://threadline-agent-$PN.$REGION.run.app"

ALLOWED_SIGN_IN="${ALLOWED_SIGN_IN:-sethiamehul14@gmail.com,mehulpersonal14@gmail.com}"

GEMINI_ENV="GOOGLE_GENAI_USE_VERTEXAI=1,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION"
GEMINI_ENV+=",GEMINI_FAST_MODEL=gemini-4-argon,GEMINI_FAST_LOCATION=global"
GEMINI_ENV+=",GEMINI_SMART_MODEL=gemini-4-argon,GEMINI_SMART_LOCATION=global"
GEMINI_ENV+=",GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio,GEMINI_LIVE_LOCATION=$REGION"
GEMINI_ENV+=",GCS_BUCKET=threadline-uploads-8f2a1,CONTEXT_DAILY_CREDIT_CAP=100"

secret() { echo "$1=threadline-$2:latest"; }

migrate() {
	# Migrations + Northwind demo seed, as a one-off job on the API image.
	gcloud run jobs deploy threadline-migrate \
		--project "$PROJECT" --region "$REGION" \
		--image "$REG/api:$TAG" \
		--service-account "$(SA api)" \
		--set-cloudsql-instances "$SQL" \
		--set-env-vars "NODE_ENV=production" \
		--set-secrets "$(secret DATABASE_URL database-url)" \
		--command sh \
		--args "-c,cd /repo/packages/db && bunx prisma migrate deploy && bun scripts/workspaces.ts && cd /repo && bun packages/db/prisma/seed-demo.ts" \
		--max-retries 0 --task-timeout 900 --quiet
	gcloud run jobs execute threadline-migrate --project "$PROJECT" --region "$REGION" --wait
}

services() {
	gcloud run deploy threadline-agent \
		--project "$PROJECT" --region "$REGION" \
		--image "$REG/agent:${AGENT_TAG:-$TAG}" \
		--service-account "$(SA agent)" \
		--no-allow-unauthenticated \
		--min-instances 0 --max-instances 1 \
		--cpu 1 --memory 1Gi --timeout 3600 \
		--no-cpu-throttling \
		--set-cloudsql-instances "$SQL" \
		--set-env-vars "NODE_ENV=production,$GEMINI_ENV" \
		--set-secrets "$(secret DATABASE_URL database-url),$(secret AGENT_BRIDGE_SECRET agent-bridge-secret),$(secret BETTER_AUTH_SECRET better-auth-secret),$(secret SLACK_STATE_SECRET slack-state-secret)" \
		--quiet

	for caller in api app; do
		gcloud run services add-iam-policy-binding threadline-agent \
			--project "$PROJECT" --region "$REGION" \
			--member "serviceAccount:$(SA "$caller")" --role roles/run.invoker \
			--quiet >/dev/null
	done

	gcloud run deploy threadline-api \
		--project "$PROJECT" --region "$REGION" \
		--image "$REG/api:${API_TAG:-$TAG}" \
		--service-account "$(SA api)" \
		--allow-unauthenticated \
		--min-instances 0 --max-instances 3 \
		--cpu 1 --memory 1Gi \
		--timeout 3600 --session-affinity \
		--set-cloudsql-instances "$SQL" \
		--set-env-vars "^|^NODE_ENV=production|API_URL=$APP_URL|APP_URL=$APP_URL|VOICE_WS_URL=${API_RUN_URL/https/wss}/api/voice/live|AGENT_URL=$AGENT_URL|AGENT_IAM_AUDIENCE=$AGENT_URL|ALLOWED_SIGN_IN=$ALLOWED_SIGN_IN|${GEMINI_ENV//,/|}" \
		--set-secrets "$(secret DATABASE_URL database-url),$(secret BETTER_AUTH_SECRET better-auth-secret),$(secret GOOGLE_CLIENT_ID google-client-id),$(secret GOOGLE_CLIENT_SECRET google-client-secret),$(secret SLACK_CLIENT_ID slack-client-id),$(secret SLACK_CLIENT_SECRET slack-client-secret),$(secret SLACK_SIGNING_SECRET slack-signing-secret),$(secret SLACK_STATE_SECRET slack-state-secret),$(secret CRON_SECRET cron-secret),$(secret AGENT_BRIDGE_SECRET agent-bridge-secret)" \
		--quiet

	gcloud run deploy threadline-app \
		--project "$PROJECT" --region "$REGION" \
		--image "$REG/app:${APP_TAG:-$TAG}" \
		--service-account "$(SA app)" \
		--allow-unauthenticated \
		--min-instances 0 --max-instances 3 \
		--cpu 1 --memory 1Gi \
		--set-cloudsql-instances "$SQL" \
		--set-env-vars "NODE_ENV=production,IS_MARKETING=true,API_INTERNAL_URL=$API_RUN_URL,APP_URL=$APP_URL,AGENT_URL=$AGENT_URL,AGENT_IAM_AUDIENCE=$AGENT_URL" \
		--set-secrets "$(secret DATABASE_URL database-url),$(secret BETTER_AUTH_SECRET better-auth-secret),$(secret DEMO_RESET_SECRET demo-reset-secret),$(secret AGENT_BRIDGE_SECRET agent-bridge-secret)" \
		--quiet
}

scheduler() {
	# Bearer secrets are read at deploy time and stored in the job config.
	local cron reset
	cron="$(gcloud secrets versions access latest --secret threadline-cron-secret --project "$PROJECT")"
	reset="$(gcloud secrets versions access latest --secret threadline-demo-reset-secret --project "$PROJECT")"

	upsert() {
		local name="$1" schedule="$2" uri="$3" token="$4"
		local verb=create headers=--headers
		if gcloud scheduler jobs describe "$name" --project "$PROJECT" --location "$REGION" >/dev/null 2>&1; then
			verb=update headers=--update-headers
		fi
		gcloud scheduler jobs "$verb" http "$name" \
			--project "$PROJECT" --location "$REGION" \
			--schedule "$schedule" --time-zone "Etc/UTC" \
			--uri "$uri" --http-method POST \
			"$headers" "Authorization=Bearer $token" \
			--attempt-deadline 180s --quiet >/dev/null
		echo "scheduler: $name ($schedule) -> $uri"
	}

	upsert threadline-revival-hourly "0 * * * *" "$API_RUN_URL/internal/revival/run" "$cron"
	upsert threadline-capture-15min "*/15 * * * *" "$API_RUN_URL/internal/sync/mailboxes" "$cron"
	upsert threadline-rates-daily "15 2 * * *" "$API_RUN_URL/internal/sync/rates" "$cron"
	upsert threadline-demo-reset-nightly "0 3 * * *" "$APP_URL/api/demo/reset" "$reset"
}

purge() {
	local who="${PURGE:?set PURGE to --email <address> or --workspace <slug>}"
	local confirm=""
	[ "${CONFIRM:-}" = "1" ] && confirm=" --confirm"
	gcloud run jobs deploy threadline-purge \
		--project "$PROJECT" --region "$REGION" \
		--image "$REG/api:$TAG" \
		--service-account "$(SA api)" \
		--set-cloudsql-instances "$SQL" \
		--set-env-vars "NODE_ENV=production" \
		--set-secrets "$(secret DATABASE_URL database-url)" \
		--command sh \
		--args "-c,cd /repo && bun packages/db/scripts/delete-workspace.ts $who$confirm" \
		--max-retries 0 --task-timeout 300 --quiet
	gcloud run jobs execute threadline-purge --project "$PROJECT" --region "$REGION" --wait || true
	sleep 5
	gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=threadline-purge" \
		--project "$PROJECT" --freshness=10m --limit 20 --order=asc --format='value(textPayload)'
}

case "$STEP" in
	migrate) migrate ;;
	services) services ;;
	scheduler) scheduler ;;
	purge) purge ;;
	all) migrate; services; scheduler ;;
	*) echo "unknown step: $STEP" >&2; exit 1 ;;
esac

echo
echo "App:   $APP_URL"
echo "API:   $API_RUN_URL"
echo "Agent: $AGENT_URL (IAM-only)"
