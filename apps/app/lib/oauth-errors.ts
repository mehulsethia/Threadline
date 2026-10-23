const RESTART =
	"The Google window was open too long, or a second one was started. Start again and finish in the same tab.";

const MESSAGES: Record<string, string> = {
	state_mismatch: RESTART,
	state_security_mismatch: RESTART,
	please_restart_the_process: RESTART,
	access_denied:
		"Google was not given permission. Start again and allow Gmail and Calendar access.",
	"email_doesn't_match":
		"That Google account has a different email address to the one you sign in with. Connect the matching Google account.",
	account_already_linked_to_different_user:
		"That Google account is already connected to another Threadline user. Connect a different Google account, or sign in as that user.",
	unable_to_link_account:
		"Google answered, but the account could not be attached. Start again.",
	invalid_code:
		"Google's answer expired before it reached Threadline. Start again.",
};

const FALLBACK =
	"Google returned an error before the connection was made. Start again.";

export function oauthErrorMessage(code: string): string {
	return MESSAGES[code] ?? FALLBACK;
}
