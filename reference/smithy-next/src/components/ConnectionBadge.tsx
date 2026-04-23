import { Monitor, Cloud, Terminal } from 'lucide-react'

interface ConnectionBadgeProps {
  type: 'local' | 'remote' | 'ssh'
}

const config: Record<string, { label: string; color: string; Icon: typeof Monitor }> = {
  local: { label: 'Local', color: 'var(--color-connection-local)', Icon: Monitor },
  remote: { label: 'Remote', color: 'var(--color-connection-remote)', Icon: Cloud },
  ssh: { label: 'SSH', color: 'var(--color-connection-ssh)', Icon: Terminal },
}

export function ConnectionBadge({ type }: ConnectionBadgeProps) {
  const { label, color, Icon } = config[type]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 'var(--radius-full)',
        fontSize: 11,
        fontWeight: 500,
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        lineHeight: '18px',
      }}
    >
      <Icon size={11} />
      {label}
    </span>
  )
}
