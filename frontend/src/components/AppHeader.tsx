type AppHeaderProps = {
  title: string
  subtitle: string
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <header className="hero">
      <p className="eyebrow">ProcityV2 thin slice</p>
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
    </header>
  )
}
