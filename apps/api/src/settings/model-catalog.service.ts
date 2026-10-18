import { Injectable, Logger } from "@nestjs/common";

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

function getStaticCatalog(): CatalogModel[] {
	const fastModel = process.env.GEMINI_FAST_MODEL || "gemini-4-argon";
	const smartModel = process.env.GEMINI_SMART_MODEL || "gemini-4-argon";
	const liveModel =
		process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";

	return [
		{
			id: fastModel,
			name: `${fastModel} (Fast)`,
			provider: "google",
			contextWindowTokens: 1_000_000,
			pricing: null,
		},
		{
			id: smartModel,
			name: `${smartModel} (Smart)`,
			provider: "google",
			contextWindowTokens: 2_000_000,
			pricing: null,
		},
		{
			id: liveModel,
			name: `${liveModel} (Live)`,
			provider: "google",
			contextWindowTokens: 1_000_000,
			pricing: null,
		},
	];
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	async models(): Promise<CatalogModel[] | null> {
		const list = getStaticCatalog();
		this.logger.log({
			message: "Model catalog loaded",
			models: list.length,
		});
		return list;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}
}
