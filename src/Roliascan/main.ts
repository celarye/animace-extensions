import { AnimaceGeneric } from "../generic/main";
import pbconfig from "./pbconfig";

const DOMAIN = "https://roliascan.com";

class RoliascanExtension extends AnimaceGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
      excludeImagePatterns: [
        "roliascan.com/wp-content/uploads/2024/07/warning-1.png",
        "roliascan.com/wp-content/uploads/2025/09/end-chapter.jpg",
      ],
      basicRateLimiter: {
        numberOfRequests: 4,
        bufferInterval: 1,
      },
    });
  }
}

export const Roliascan = new RoliascanExtension();
