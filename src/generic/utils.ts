export class AnimaceHelper {
  private domain: string;

  constructor(domain: string) {
    this.domain = domain;
  }

  fixImageUrl(url: string): string {
    if (!url || url.trim() === "") return "";
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith("//")) {
      return "https:" + trimmedUrl;
    }
    if (trimmedUrl.startsWith("/")) {
      return this.domain + trimmedUrl;
    }
    return trimmedUrl;
  }
}
