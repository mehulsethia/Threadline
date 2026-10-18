import { randomUUID } from "node:crypto";
import {
	type Db,
	DealStage,
	FactBand,
	FactStatus,
	requireWorkspaceId,
	runInWorkspace,
} from "@crm/db";
import { consumeDemoQuota } from "@crm/db/demo";
import { jsonText } from "@crm/validation/json-text";
import {
	GoogleGenAI,
	type LiveServerMessage,
	Modality,
	type Session,
	type Tool,
	Type,
} from "@google/genai";
import {
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import {
	type VoiceCategory,
	type VoiceDealContextOutput,
	type VoiceTranscribeQualifyOutput,
	voiceCategoryEnum,
} from "./voice.contracts";

/** The Gemini Live session the gateway streams audio through. */
export type LiveSessionBridge = Session;

/** `record_answer` arguments from the live model, checked before use. */
const recordAnswerArgs = z.object({
	category: voiceCategoryEnum,
	fact: z.string(),
	quote: z.string(),
});

/** The fallback recorder's analysis; malformed facts are dropped. */
const recordingAnalysis = z.object({
	transcript: z.string().optional().catch(undefined),
	facts: z
		.array(recordAnswerArgs.nullable().catch(null))
		.catch([])
		.transform((facts) =>
			facts.filter(
				(fact): fact is z.infer<typeof recordAnswerArgs> => fact !== null,
			),
		),
});

const ALL_CATEGORIES: VoiceCategory[] = [
	"budget",
	"authority",
	"need",
	"timeline",
	"competitors",
	"decision_process",
];

@Injectable()
export class VoiceQualifierService {
	private readonly logger = new Logger(VoiceQualifierService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * The person on the call: whoever on the deal wrote last, else the contact
	 * marked primary, else a stable pick (never an unordered first row).
	 */
	private async callContact<
		C extends { contactId: string; role: string | null; contact: unknown },
	>(dealId: string, contacts: C[]): Promise<C["contact"] | undefined> {
		if (contacts.length <= 1) return contacts[0]?.contact;
		const lastInbound = await this.db.whatsAppMessage.findFirst({
			where: {
				dealId,
				direction: "INBOUND",
				contactId: { in: contacts.map((c) => c.contactId) },
			},
			orderBy: { timestamp: "desc" },
			select: { contactId: true },
		});
		return (
			contacts.find((c) => c.contactId === lastInbound?.contactId) ??
			contacts.find((c) => /primary/i.test(c.role ?? "")) ??
			[...contacts].sort((a, b) => a.contactId.localeCompare(b.contactId))[0]
		)?.contact;
	}

	/** One live call against the judge account's daily cap. */
	consumeCallQuota(userId: string): Promise<boolean> {
		return consumeDemoQuota(this.db, userId, "voice");
	}

	async getDealContext(
		dealId: string,
		orgId?: string,
	): Promise<VoiceDealContextOutput> {
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			include: {
				contacts: { include: { contact: true } },
				company: true,
				facts: true,
			},
		});

		if (!deal) {
			throw new NotFoundException(`Deal with id ${dealId} was not found.`);
		}

		if (orgId) {
			const member = await this.db.member.findFirst({
				where: { userId: deal.ownerId, organizationId: orgId },
			});
			if (!member && process.env.NODE_ENV === "production") {
				throw new ForbiddenException(
					"Access denied to deal in another workspace.",
				);
			}
		}

		const primaryContact = await this.callContact(dealId, deal.contacts);
		const leadName = primaryContact
			? [primaryContact.firstName, primaryContact.lastName]
					.filter(Boolean)
					.join(" ") || "Prospect"
			: "Prospect";

		const knownFacts: Record<string, string> = {};
		for (const fact of deal.facts) {
			if (
				fact.status !== FactStatus.DISMISSED &&
				(fact.contactId === null ||
					(primaryContact && fact.contactId === primaryContact.id))
			) {
				knownFacts[fact.field] = fact.value;
			}
		}

		const missingCategories: VoiceCategory[] = [];
		for (const cat of ALL_CATEGORIES) {
			const exists =
				knownFacts[`qualification.${cat}`] ||
				deal.facts.some(
					(f) =>
						f.field.includes(cat) &&
						f.status !== FactStatus.DISMISSED &&
						(f.contactId === null ||
							(primaryContact && f.contactId === primaryContact.id)),
				);
			if (!exists) {
				missingCategories.push(cat);
			}
		}

		let detectedLanguage = "en";
		if (primaryContact) {
			const contactMsg = await this.db.whatsAppMessage.findFirst({
				where: {
					contactId: primaryContact.id,
					direction: "INBOUND",
				},
				orderBy: { timestamp: "desc" },
			});
			if (contactMsg?.body) {
				const body = contactMsg.body.toLowerCase();
				if (
					/\b(?:und|ich|wir|bitte|termin|bereitstellung|nachfragen|geplante|angebot|grüße)\b/i.test(
						body,
					)
				) {
					detectedLanguage = "de";
				} else if (
					/\b(?:bonjour|merci|vous|nous|projet|devis|accord)\b/i.test(body)
				) {
					detectedLanguage = "fr";
				} else if (
					/\b(?:hola|gracias|nosotros|ustedes|proyecto|presupuesto)\b/i.test(
						body,
					)
				) {
					detectedLanguage = "es";
				}
			} else {
				const langFact = deal.facts.find(
					(f) =>
						f.field === "language" &&
						(f.contactId === primaryContact.id || f.contactId === null),
				);
				if (langFact?.value) {
					detectedLanguage = langFact.value;
				}
			}
		}

		const coveredCount = ALL_CATEGORIES.length - missingCategories.length;
		const qualificationScore = Math.round(
			(coveredCount / ALL_CATEGORIES.length) * 100,
		);

		const proposedStageFact = deal.facts.find(
			(f) =>
				f.field === "qualification.proposed_stage" &&
				f.status === FactStatus.PROPOSED,
		);

		return {
			dealId: deal.id,
			dealName: deal.name,
			leadName,
			leadPhone: primaryContact?.phone ?? null,
			leadEmail: primaryContact?.email ?? null,
			companyName: deal.company?.name ?? null,
			language: detectedLanguage,
			knownFacts,
			missingCategories,
			currentStage: deal.stage,
			proposedStage: proposedStageFact?.value ?? null,
			qualificationScore,
		};
	}

	buildSystemInstruction(
		context: VoiceDealContextOutput,
		workspaceName = "Threadline Systems",
	): string {
		const knownSummary =
			Object.keys(context.knownFacts).length > 0
				? Object.entries(context.knownFacts)
						.map(([k, v]) => `• ${k}: ${v}`)
						.join("\n")
				: "None yet recorded.";

		const missingList =
			context.missingCategories.length > 0
				? context.missingCategories.join(", ")
				: "All standard categories answered; confirm timeline and next steps.";

		return [
			`You are a professional voice qualification specialist for ${workspaceName}.`,
			`You are speaking live with ${context.leadName}${context.companyName ? ` from ${context.companyName}` : ""}.`,
			`The deal in discussion is "${context.dealName}".`,
			`The customer's language is "${context.language}". Respond in "${context.language}".`,
			`Keep every turn concise (1 to 2 sentences). Sound natural, polite, and consultative.`,
			`Already known information (DO NOT ask about these again):`,
			knownSummary,
			`Your goal is to politely uncover only what is missing: ${missingList}.`,
			`Focus on BANTC:`,
			`- budget: allocation, pricing comfort or constraints`,
			`- authority: who makes the ultimate purchasing decision`,
			`- need: primary pain point, problem, or must-have capability`,
			`- timeline: targeted launch, implementation date, or urgency`,
			`- competitors: other tools or alternatives they are evaluating`,
			`- decision_process: steps required before signing a contract`,
			`When the prospect answers any of these items, immediately call the tool 'record_answer' with category, a clean factual summary, and their verbatim quote.`,
			`Wrap up gracefully within 3 minutes once the critical missing points are addressed.`,
		].join("\n");
	}

	async createLiveSession(params: {
		context: VoiceDealContextOutput;
		onAudioChunk: (pcmBase64: string) => void;
		onTranscript: (turn: { role: "assistant" | "user"; text: string }) => void;
		onFactProposed: (fact: {
			category: VoiceCategory;
			fact: string;
			quote: string;
			proposedScore: number;
			proposedStage: string | null;
		}) => void;
		onClose: (reason?: string) => void;
	}) {
		const project =
			process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
		const location = process.env.GEMINI_LIVE_LOCATION || "us-central1";
		const model =
			process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";

		const ai = new GoogleGenAI({
			vertexai: true,
			project,
			location,
		});

		const systemInstruction = this.buildSystemInstruction(params.context);

		const tools: Tool[] = [
			{
				functionDeclarations: [
					{
						name: "record_answer",
						description:
							"Record a verified qualification answer (budget, authority, need, timeline, competitors, or decision process) with verbatim quote spoken by the lead.",
						parameters: {
							type: Type.OBJECT,
							properties: {
								category: {
									type: Type.STRING,
									description:
										"One of: budget, authority, need, timeline, competitors, decision_process",
									enum: [
										"budget",
										"authority",
										"need",
										"timeline",
										"competitors",
										"decision_process",
									],
								},
								fact: {
									type: Type.STRING,
									description: "Factual summary of the confirmed answer",
								},
								quote: {
									type: Type.STRING,
									description:
										"Verbatim quote spoken by the prospect during the call",
								},
							},
							required: ["category", "fact", "quote"],
						},
					},
				],
			},
		];

		const workspace = requireWorkspaceId();
		const session: Session = await ai.live.connect({
			model,
			config: {
				responseModalities: [Modality.AUDIO],
				systemInstruction: {
					parts: [{ text: systemInstruction }],
				},
				tools,
			},
			callbacks: {
				onopen: () => {
					this.logger.log(
						`Live session established for deal ${params.context.dealId}`,
					);
				},
				onmessage: (msg: LiveServerMessage) =>
					runInWorkspace(workspace, async () => {
						const serverContent = msg.serverContent;

						if (serverContent) {
							const parts = serverContent.modelTurn?.parts || [];
							for (const part of parts) {
								if (part.inlineData?.data) {
									params.onAudioChunk(part.inlineData.data);
								}
								if (part.text) {
									params.onTranscript({ role: "assistant", text: part.text });
								}
							}

							if (serverContent.inputTranscription?.text) {
								params.onTranscript({
									role: "user",
									text: serverContent.inputTranscription.text,
								});
							}

							if (serverContent.outputTranscription?.text) {
								params.onTranscript({
									role: "assistant",
									text: serverContent.outputTranscription.text,
								});
							}
						}

						for (const call of msg.toolCall?.functionCalls ?? []) {
							if (call.name === "record_answer") {
								// The model's arguments are untrusted until they parse.
								const parsedArgs = recordAnswerArgs.safeParse(call.args);
								if (parsedArgs.success) {
									const args = parsedArgs.data;

									const recorded = await this.recordLiveAnswer(
										params.context.dealId,
										args,
									);

									try {
										session.sendToolResponse({
											functionResponses: [
												{
													id: call.id,
													name: call.name,
													response: { success: true, recorded: true },
												},
											],
										});
									} catch (err) {
										this.logger.error("Failed to send tool response", err);
									}

									params.onFactProposed({
										category: args.category,
										fact: args.fact,
										quote: args.quote,
										proposedScore: recorded.proposedScore,
										proposedStage: recorded.proposedStage,
									});
								}
							}
						}
					}),
				onerror: (event: ErrorEvent) => {
					this.logger.error("Live session error", event.message);
					params.onClose(event.message);
				},
				onclose: (event: CloseEvent) => {
					this.logger.log(
						`Live session closed for deal ${params.context.dealId}`,
					);
					params.onClose(event.reason || undefined);
				},
			},
		});

		return session;
	}

	async recordLiveAnswer(
		dealId: string,
		input: {
			category: VoiceCategory;
			fact: string;
			quote: string;
		},
	): Promise<{ proposedScore: number; proposedStage: string | null }> {
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			include: { contacts: { include: { contact: true } }, facts: true },
		});

		if (!deal) {
			throw new NotFoundException(`Deal ${dealId} not found.`);
		}

		const primaryContact = await this.callContact(deal.id, deal.contacts);

		const evidence = [
			{
				evidenceId: `ev_${randomUUID().slice(0, 8)}`,
				kind: "voice.live-call",
				quote: input.quote,
				weight: 0.9,
				primary: true,
			},
		];

		await this.db.contactFact.create({
			data: {
				dealId: deal.id,
				contactId: primaryContact?.id ?? null,
				field: `qualification.${input.category}`,
				value: input.fact,
				score: 0.9,
				band: FactBand.VERIFIED,
				evidence,
				method: "gemini-live-call",
				status: FactStatus.PROPOSED,
			},
		});

		const allFacts = await this.db.contactFact.findMany({
			where: { dealId, status: { not: FactStatus.DISMISSED } },
		});

		const coveredCategories = new Set<string>();
		coveredCategories.add(input.category);
		for (const fact of allFacts) {
			for (const cat of ALL_CATEGORIES) {
				if (fact.field.includes(cat)) {
					coveredCategories.add(cat);
				}
			}
		}

		const proposedScore = Math.min(
			100,
			Math.round((coveredCategories.size / ALL_CATEGORIES.length) * 100),
		);

		await this.db.contactFact.deleteMany({
			where: {
				dealId,
				field: "qualification.score",
				status: FactStatus.PROPOSED,
			},
		});

		await this.db.contactFact.create({
			data: {
				dealId: deal.id,
				contactId: primaryContact?.id ?? null,
				field: "qualification.score",
				value: `${proposedScore}/100`,
				score: 0.9,
				band: FactBand.VERIFIED,
				evidence,
				method: "qualification-score-engine",
				status: FactStatus.PROPOSED,
			},
		});

		let proposedStage: string | null = null;
		const hasNeed = coveredCategories.has("need");
		const hasBudget = coveredCategories.has("budget");
		const hasTimeline = coveredCategories.has("timeline");

		if (hasNeed && (hasBudget || hasTimeline)) {
			if (deal.stage === DealStage.UNQUALIFIED_TO_BUY) {
				proposedStage = DealStage.QUALIFIED_TO_BUY;
			}
		}

		if (proposedStage) {
			await this.db.contactFact.deleteMany({
				where: {
					dealId,
					field: "qualification.proposed_stage",
					status: FactStatus.PROPOSED,
				},
			});

			await this.db.contactFact.create({
				data: {
					dealId: deal.id,
					contactId: primaryContact?.id ?? null,
					field: "qualification.proposed_stage",
					value: proposedStage,
					score: 0.9,
					band: FactBand.VERIFIED,
					evidence,
					method: "stage-criteria-engine",
					status: FactStatus.PROPOSED,
				},
			});
		}

		return { proposedScore, proposedStage };
	}

	async transcribeAndQualify(input: {
		dealId: string;
		audioBuffer: Buffer;
		mimeType?: string;
		orgId?: string;
	}): Promise<VoiceTranscribeQualifyOutput> {
		const context = await this.getDealContext(input.dealId, input.orgId);

		const project =
			process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
		const location = process.env.GEMINI_FAST_LOCATION || "global";
		const model = process.env.GEMINI_FAST_MODEL || "gemini-4-argon";

		const ai = new GoogleGenAI({
			vertexai: true,
			project,
			location,
		});

		const audioBase64 = input.audioBuffer.toString("base64");
		const mimeType = input.mimeType || "audio/webm";

		const prompt = [
			`You are transcribing and analyzing an outbound qualification voice recording.`,
			`1. Transcribe the audio verbatim.`,
			`2. Extract any lead qualification facts corresponding to: budget, authority, need, timeline, competitors, decision_process.`,
			`3. Return a JSON object formatted as:`,
			`{`,
			`  "transcript": "...",`,
			`  "facts": [`,
			`    { "category": "budget", "fact": "...", "quote": "..." }`,
			`  ]`,
			`}`,
		].join("\n");

		const response = await ai.models.generateContent({
			model,
			contents: [
				{
					role: "user",
					parts: [
						{ inlineData: { mimeType, data: audioBase64 } },
						{ text: prompt },
					],
				},
			],
			config: {
				responseMimeType: "application/json",
			},
		});

		const text = response.text || "{}";
		const result = jsonText.pipe(recordingAnalysis).safeParse(text);
		const parsed = result.success
			? result.data
			: { transcript: text, facts: [] };

		const transcript = parsed.transcript || "Audio recorded.";
		const recordedFacts: Array<{
			category: VoiceCategory;
			fact: string;
			quote: string;
		}> = [];

		let lastScore = context.qualificationScore;
		let lastStage = context.proposedStage;
		for (const f of parsed.facts) {
			if (f.fact && f.quote) {
				const res = await this.recordLiveAnswer(input.dealId, {
					category: f.category,
					fact: f.fact,
					quote: f.quote,
				});
				lastScore = res.proposedScore;
				lastStage = res.proposedStage;
				recordedFacts.push(f);
			}
		}

		return {
			dealId: input.dealId,
			transcript,
			recordedFacts,
			proposedScore: lastScore,
			proposedStage: lastStage,
		};
	}
}
