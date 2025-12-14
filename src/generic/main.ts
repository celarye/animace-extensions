import {
  BasicRateLimiter,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type Request,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
} from "@paperback/types";
import { AnimaceInterceptor, fetchRequest } from "./network";
import { AnimaceParser } from "./parsers";
import { AnimaceHelper } from "./utils";

type AnimaceImplementation = Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding;

export interface AnimaceConfig {
  domain: string;
  name: string;
  contentRating: ContentRating;
  language: string;
  excludeImagePatterns?: string[];
  basicRateLimiter?: {
    numberOfRequests: number;
    bufferInterval: number;
    ignoreImages?: boolean;
  };
}

export class AnimaceGeneric implements AnimaceImplementation {
  protected domain: string;
  protected name: string;
  protected contentRating: ContentRating;
  protected language: string;
  protected mainRateLimiter: BasicRateLimiter;

  mainInterceptor: AnimaceInterceptor;
  cookieStorageInterceptor: CookieStorageInterceptor;
  parser: AnimaceParser;
  helper: AnimaceHelper;

  constructor(config: AnimaceConfig) {
    this.domain = config.domain;
    this.name = config.name;
    this.contentRating = config.contentRating;
    this.language = config.language;
    this.mainRateLimiter = new BasicRateLimiter("main", {
      numberOfRequests: config.basicRateLimiter?.numberOfRequests ?? 4,
      bufferInterval: config.basicRateLimiter?.bufferInterval ?? 1,
      ignoreImages: config.basicRateLimiter?.ignoreImages ?? true,
    });

    this.mainInterceptor = new AnimaceInterceptor("main", this.domain);
    this.cookieStorageInterceptor = new CookieStorageInterceptor({
      storage: "stateManager",
    });

    this.helper = new AnimaceHelper(this.domain);
    this.parser = new AnimaceParser(this.domain, config.excludeImagePatterns);
  }

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular",
        title: "Popular Lately",
        subtitle: "Most viewed series",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest",
        title: "Latest Updates",
        subtitle: "Recently updated manga",
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "weekly",
        title: "Weekly Recommendations",
        subtitle: "Staff picks of the week",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: number | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata ?? 1;

    if (section.id === "weekly") {
      const request: Request = {
        url: this.domain,
        method: "GET",
      };
      const html = await fetchRequest(request);
      return this.parser.parseWeeklyRecommendations(html);
    } else if (section.id === "latest") {
      const request: Request = {
        url: `${this.domain}/updated-mangas0/?_paged=${page}`,
        method: "GET",
      };
      const html = await fetchRequest(request);
      return this.parser.parseLatestUpdates(html, page);
    } else {
      const request: Request = {
        url: `${this.domain}/wp-content/themes/animacewp/most_viewed_series.json`,
        method: "GET",
      };
      const jsonStr = await fetchRequest(request);
      return this.parser.parsePopularItems(jsonStr, section.type);
    }
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [];
  }

  async getSearchResults(query: SearchQuery): Promise<PagedResults<SearchResultItem>> {
    if (!query.title || query.title.trim() === "") {
      return { items: [] };
    }

    const searchQuery = encodeURIComponent(query.title.trim());
    const request = {
      url: `${this.domain}/?s=${searchQuery}&asp_active=1&p_asid=1&p_asp_data=1&asp_gen[]=title&asp_gen[]=exact`,
      method: "GET" as const,
    };

    const html = await fetchRequest(request);
    return this.parser.parseSearchResults(html);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const request: Request = {
      url: `${this.domain}/manga/${mangaId}`,
      method: "GET",
    };

    const html = await fetchRequest(request);
    return this.parser.parseMangaDetails(html, mangaId, this.contentRating);
  }

  async getChapters(sourceManga: SourceManga, sinceDate?: Date): Promise<Chapter[]> {
    void sinceDate;

    const request: Request = {
      url: `${this.domain}/manga/${sourceManga.mangaId}/chapterlist/`,
      method: "GET",
    };

    const html = await fetchRequest(request);
    return this.parser.parseChapters(html, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const chapterUrl = `${this.domain}/manga/${chapter.sourceManga.mangaId}/chapter-${chapter.chapterId}`;

    const request: Request = {
      url: chapterUrl,
      method: "GET",
    };

    const html = await fetchRequest(request);
    return this.parser.parseChapterDetails(html, chapter.chapterId, chapter.sourceManga.mangaId);
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    const existingCookies = [...this.cookieStorageInterceptor.cookies];
    for (const cookie of existingCookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    for (const cookie of cookies) {
      if (!cookie.expires || cookie.expires.getTime() > Date.now()) {
        this.cookieStorageInterceptor.setCookie(cookie);
      }
    }
  }

  async getCloudflareBypassRequest(): Promise<Request> {
    return {
      url: this.domain,
      method: "GET",
      headers: {
        referer: this.domain,
        origin: this.domain,
      },
    };
  }
}
