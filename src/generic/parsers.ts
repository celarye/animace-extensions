import {
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionItem,
  type PagedResults,
  type SearchResultItem,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { AnimaceHelper } from "./utils";

export class AnimaceParser {
  private domain: string;
  private helper: AnimaceHelper;
  private excludePatterns: string[];

  constructor(domain: string, excludePatterns?: string[]) {
    this.domain = domain;
    this.helper = new AnimaceHelper(domain);
    this.excludePatterns = excludePatterns ?? [];
  }

  parseWeeklyRecommendations(html: string): PagedResults<DiscoverSectionItem> {
    const $ = cheerio.load(html);
    const items: DiscoverSectionItem[] = [];

    $(".carousel.home-novels-sld .col-6.col-sm-4.col-xl-2.p-3.post").each((_i, el) => {
      const $el = $(el);

      const titleElement = $el.find("h6 a");
      const link = titleElement.attr("href");
      const title = titleElement.text().trim();

      if (!link || !link.includes("/manga/")) return;

      const mangaId = link.split("/manga/")[1]?.replace(/\/$/, "") ?? "";
      const imageUrl = this.helper.fixImageUrl($el.find("img.poster").attr("src") ?? "");

      if (mangaId && title) {
        items.push({
          mangaId,
          title,
          imageUrl,
          type: "simpleCarouselItem",
        });
      }
    });

    return {
      items,
      metadata: undefined,
    };
  }

  parseLatestUpdates(html: string, page: number): PagedResults<DiscoverSectionItem> {
    const $ = cheerio.load(html);
    const items: DiscoverSectionItem[] = [];

    $(".article-feed .post").each((_i, el) => {
      const $el = $(el);

      const titleElement = $el.find("h6.titleh6series a");
      const link = titleElement.attr("href");
      const title = titleElement.text().trim();

      if (!link || !link.includes("/manga/")) return;

      const mangaId = link.split("/manga/")[1]?.replace(/\/$/, "") ?? "";
      const imageUrl = this.helper.fixImageUrl($el.find("img").attr("src") ?? "");

      const firstChapterLink = $el.find(".chapter-row").first().find("a").attr("href");

      const latestChapterTitle = $el.find(".chapter-row").first().find("a").text().trim();

      let chapterId = "";
      if (firstChapterLink) {
        const chapterMatch = firstChapterLink.match(/\/chapter-([^/?]+)/);
        chapterId = chapterMatch?.[1] ?? "";
      }

      if (mangaId && title && chapterId) {
        items.push({
          mangaId,
          title,
          chapterId,
          subtitle: latestChapterTitle || undefined,
          imageUrl,
          type: "chapterUpdatesCarouselItem",
        });
      }
    });

    let metadata: number | undefined = undefined;

    if (items.length > 0 && page < 10) {
      metadata = page + 1;
    }

    return {
      items,
      metadata: metadata,
    };
  }

  parseRelativeDate(dateText: string): Date {
    const now = new Date();
    const lowerText = dateText.toLowerCase();

    if (lowerText.includes("just now") || lowerText.includes("now")) {
      return now;
    }

    const minutesMatch = lowerText.match(/(\d+)\s*min/);
    if (minutesMatch && minutesMatch[1]) {
      const minutes = parseInt(minutesMatch[1]);
      return new Date(now.getTime() - minutes * 60 * 1000);
    }

    const hoursMatch = lowerText.match(/(\d+)\s*hour/);
    if (hoursMatch && hoursMatch[1]) {
      const hours = parseInt(hoursMatch[1]);
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }

    const daysMatch = lowerText.match(/(\d+)\s*day/);
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1]);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const dateMatch = lowerText.match(/(\w+)\s+(\d+),\s+(\d+)/);
    if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
      const monthStr = dateMatch[1];
      const day = parseInt(dateMatch[2]);
      const year = parseInt(dateMatch[3]);
      const month = monthNames.findIndex((m) => monthStr.startsWith(m));
      if (month !== -1) {
        return new Date(year, month, day);
      }
    }

    return now;
  }

  parsePopularItems(
    jsonStr: string,
    sectionType: DiscoverSectionType,
  ): PagedResults<DiscoverSectionItem> {
    const items: DiscoverSectionItem[] = [];

    const itemType: "prominentCarouselItem" | "simpleCarouselItem" =
      sectionType === DiscoverSectionType.prominentCarousel
        ? "prominentCarouselItem"
        : "simpleCarouselItem";

    let jsonData:
      | {
          most_viewed_series: {
            url: string;
            title: string;
            image: string;
          }[];
        }
      | undefined;
    try {
      jsonData = JSON.parse(jsonStr) as typeof jsonData;
    } catch {
      throw new Error("Failed to parse popular items JSON.");
    }

    if (!jsonData || !jsonData.most_viewed_series) {
      return { items: [] };
    }

    for (const manga of jsonData.most_viewed_series) {
      const mangaUrl = manga.url;
      const title = manga.title;
      const imageUrl = this.helper.fixImageUrl(manga.image);

      if (!mangaUrl || !mangaUrl.includes("/manga/") || !title) {
        continue;
      }

      const mangaId = mangaUrl.split("/manga/")[1]?.replace(/\/$/, "") ?? "";

      if (mangaId && title) {
        items.push({
          mangaId,
          title,
          imageUrl,
          type: itemType,
        });
      }
    }

    return {
      items,
      metadata: undefined,
    };
  }

  parseSearchResults(html: string): PagedResults<SearchResultItem> {
    const $ = cheerio.load(html);
    const results: SearchResultItem[] = [];

    $(".col-12.p-3.post").each((_i, el) => {
      const $el = $(el);
      const link = $el.find("a").first().attr("href");

      if (!link || !link.includes("/manga/")) return;

      const mangaId = link.split("/manga/")[1]?.replace(/\/$/, "") ?? "";
      const title = $el.find("h4 a").text().trim();
      const imageUrl = this.helper.fixImageUrl($el.find("img.poster").attr("src") ?? "");

      const badge = $el.find(".custom-badge").text().trim();

      if (mangaId && title) {
        results.push({
          mangaId,
          title,
          subtitle: badge || undefined,
          imageUrl,
        });
      }
    });

    return {
      items: results,
    };
  }

  parseMangaDetails(html: string, mangaId: string, contentRating: ContentRating): SourceManga {
    const $ = cheerio.load(html);
    const title = $(".post-type-header-inner h1").first().text().trim() || mangaId;

    const rawImageUrl = $("img.poster, .col-md-3 img.wp-post-image").first().attr("src") ?? "";
    const imageUrl = this.helper.fixImageUrl(rawImageUrl);
    const validImageUrl = imageUrl && imageUrl.startsWith("http") ? imageUrl : "";

    let author = "Unknown";
    $("table.table tr").each((_i, el) => {
      const $row = $(el);
      const header = $row.find("th").text().trim().toLowerCase();
      if (header.includes("artist")) {
        author = $row.find("td").text().trim();
      }
    });

    let description = "No description available.";
    $(".card-movies-series .card-body").each((_i, el) => {
      const $el = $(el);
      const h5Text = $el.find("h5").first().text().trim().toLowerCase();
      if (h5Text.includes("synopsis")) {
        const allText: string[] = [];
        $el.find("p").each((_i, p) => {
          const text = $(p).text().trim();
          if (text.length > 0) {
            allText.push(text);
          }
        });
        if (allText.length > 0) {
          description = allText.join(" ");
        }
      }
    });

    let status: "ONGOING" | "COMPLETED" | "UNKNOWN" = "UNKNOWN";
    $("table.table tr").each((_i, el) => {
      const $row = $(el);
      const header = $row.find("th").text().trim().toLowerCase();
      if (header.includes("status")) {
        const statusText = $row.find("td").text().trim().toLowerCase();
        if (statusText.includes("ongoing")) {
          status = "ONGOING";
        } else if (statusText.includes("completed") || statusText.includes("complete")) {
          status = "COMPLETED";
        }
      }
    });

    const tags: Tag[] = [];
    $(".post-type-header-inner .btn-custom").each((_i, el) => {
      const genreText = $(el).text().trim();
      if (genreText && genreText.length < 30) {
        tags.push({
          id: genreText.toLowerCase().replace(/\s+/g, "-"),
          title: genreText,
        });
      }
    });

    const tagSections: TagSection[] = [];
    if (tags.length > 0) {
      tagSections.push({
        id: "genres",
        title: "Genres",
        tags,
      });
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: validImageUrl,
        synopsis: description,
        author: author !== "Unknown" ? author : undefined,
        contentRating,
        status,
        tagGroups: tagSections,
      },
    };
  }

  parseChapters(html: string, sourceManga: SourceManga): Chapter[] {
    const $ = cheerio.load(html);
    const chapters: Chapter[] = [];

    $(".chapter-list-row").each((i, el) => {
      const $el = $(el);
      const chapterLink = $el.find("a").first().attr("href");

      if (!chapterLink) return;

      const chapterMatch = chapterLink.match(/\/chapter-([^/?]+)/);
      const chapterId = chapterMatch?.[1] ?? `${i}`;

      const chapterTitle = $el.find(".main-chapter-title").text().trim();

      const chapNumMatch = chapterId.match(/^(\d+(?:\.\d+)?)/);
      const chapNum = chapNumMatch?.[1] ? parseFloat(chapNumMatch[1]) : i + 1;

      const dateText = $el.find(".chapter-date").text().trim();
      const publishDate = this.parseRelativeDate(dateText);

      chapters.push({
        chapterId,
        sourceManga,
        langCode: "EN",
        chapNum,
        title: chapterTitle,
        volume: undefined,
        publishDate,
      });
    });

    return chapters.reverse();
  }

  parseChapterDetails(htmlStr: string, chapterId: string, mangaId: string): ChapterDetails {
    const $ = cheerio.load(htmlStr);
    const pages: string[] = [];

    const contentContainer = $(".manga-child-the-content.my-5");
    if (contentContainer.length === 0) {
      throw new Error("Content container not found. Unable to extract images.");
    }

    contentContainer.find("img").each((_index, el) => {
      const $img = $(el);

      let imgUrl = $img.attr("src") ?? $img.attr("data-src") ?? "";

      if (!imgUrl || imgUrl.trim() === "") {
        return;
      }

      imgUrl = imgUrl.trim();

      if (this.excludePatterns.some((pattern) => imgUrl.includes(pattern))) {
        return;
      }

      const finalUrl = this.helper.fixImageUrl(imgUrl);

      if (
        finalUrl &&
        finalUrl.trim() !== "" &&
        (finalUrl.startsWith("http://") || finalUrl.startsWith("https://"))
      ) {
        pages.push(finalUrl);
      }
    });

    if (pages.length === 0) {
      throw new Error(`No images found for chapter ${chapterId}.`);
    }

    return {
      id: chapterId,
      mangaId: mangaId,
      pages: pages,
    };
  }
}
