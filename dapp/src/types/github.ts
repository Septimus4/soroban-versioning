export interface FormattedCommit {
  message: string;
  author: { name: string; html_url?: string | null };
  commit_date: string;
  html_url?: string | null;
  sha: string;
}
