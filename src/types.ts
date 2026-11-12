export interface Source {
  id: string;
  name: string;
  category: string;
  query: string;
  language: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  lastSuccess?: string;
  lastError?: string;
  lastAttempt?: string;
  items?: number;
}
export interface Feed extends Source {
  url: string;
}
export interface Article {
  id: string;
  guids: string[];
  url: string;
  title: string;
  description: string;
  publisher: string;
  publishedAt: string | null;
  collectedAt: string;
  language: "English" | "Arabic";
  categories: string[];
  sourceIds: string[];
}
export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "partial" | "failed";
  successful: number;
  failed: number;
  added: number;
  error?: string;
}
export interface Snapshot {
  articles: Article[];
  sources: Source[];
  run: SyncRun | null;
  lastSuccess: string | null;
  bookmarks: string[];
  admin: boolean;
}
