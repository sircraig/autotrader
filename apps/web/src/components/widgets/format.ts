export function formatClock(value: string | null): string {
  if (!value) {
    return 'waiting';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  })}`;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4
  });
}

export function formatSigned(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString(undefined, {
    maximumFractionDigits: 2
  })}${suffix}`;
}

export function getTone(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-matrix-muted';
  }

  if (value > 0) {
    return 'text-matrix-accent-strong';
  }

  if (value < 0) {
    return 'text-[#ffb9aa]';
  }

  return 'text-[#ffe5a1]';
}
