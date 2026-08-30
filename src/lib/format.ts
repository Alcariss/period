export function formatDate(dateInput: string): string {
  return new Date(dateInput).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function todayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

export function cacheAgeText(ageMs: number): string {
  if (ageMs < 60_000) {
    return 'just now';
  }

  if (ageMs < 3_600_000) {
    return `about ${Math.floor(ageMs / 60_000)} min ago`;
  }

  return `about ${Math.floor(ageMs / 3_600_000)} h ago`;
}
