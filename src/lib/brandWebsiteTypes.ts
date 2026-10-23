export type WebsiteLogo = {
	name: string;
	url: string;
	mime: string;
	data: string;
	kind: "logo" | "icon";
};
export type WebsiteBrand = {
	url: string;
	title: string;
	description: string;
	text: string;
	colors: string[];
	fonts: string[];
	logos: WebsiteLogo[];
	warnings: string[];
};
