"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Loader2, MessageSquare, RefreshCw, Send, UserPlus, Users } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { cn } from "@/lib/utils"

const RANGES = [7, 30, 90]

const chartConfig = {
  received: { label: "Received", theme: { light: "#2a78d6", dark: "#3987e5" } },
  sent: { label: "Sent", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig

interface Insights {
  days: number
  totals: {
    activeConversations: number
    newContacts: number
    totalContacts: number
    received: number
    sent: number
    conversationsWithIncoming: number
    conversationsAnswered: number
    responseRate: number | null
  }
  series: Array<{ date: string; received: number; sent: number }>
  topContacts: Array<{ id: string; username: string; received: number; sent: number; lastMessageAt: string }>
  truncated: boolean
}

const formatDay = (date: string, month: "short" | "long" = "short") =>
  new Date(`${date}T12:00:00`).toLocaleDateString([], { month, day: "numeric" })

export default function AnalyticsPage() {
  const { userId, isLoading } = useInstagramSession()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState<"chart" | "table">("chart")

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    fetch(`/api/analytics?userId=${userId}&days=${days}&tz=${encodeURIComponent(tz)}`, { cache: "no-store" })
      .then(async response => {
        const json = await response.json()
        if (!response.ok) throw new Error(json?.error || "Failed to load insights")
        return json as Insights
      })
      .then(json => { if (active) { setData(json); setError(null) } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Failed to load insights") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, days, reloadKey])

  if (isLoading || (loading && !data && !error)) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
  if (!userId) return null

  const totals = data?.totals
  const hasActivity = !!totals && totals.received + totals.sent > 0
  const responseRate = totals?.responseRate == null ? "—" : `${Math.round(totals.responseRate * 100)}%`

  return <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
    <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div><p className="text-sm text-muted-foreground">Performance</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">Insights</h1><p className="mt-2 text-sm text-muted-foreground">Understand how people engage with your automated conversations.</p></div>
      <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Time range">
        {RANGES.map(range => <button key={range} type="button" onClick={() => setDays(range)} aria-pressed={days === range} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", days === range ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>Last {range} days</button>)}
      </div>
    </header>

    <div className={cn("grid border-b border-border sm:grid-cols-2 lg:grid-cols-4 transition-opacity", loading && "opacity-60")}>
      <Metric label="Conversations" value={totals?.activeConversations} hint={totals ? `${totals.totalContacts.toLocaleString()} contacts all time` : undefined} icon={MessageSquare} />
      <Metric label="New contacts" value={totals?.newContacts} hint="People who messaged you for the first time" icon={UserPlus} />
      <Metric label="Messages sent" value={totals?.sent} hint={totals ? `${totals.received.toLocaleString()} received` : undefined} icon={Send} />
      <Metric label="Response rate" value={responseRate} hint={totals ? `${totals.conversationsAnswered} of ${totals.conversationsWithIncoming} conversations answered` : undefined} icon={Activity} />
    </div>

    {error && <div role="alert" className="mt-7 flex items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm text-destructive"><span>{error}</span><button type="button" onClick={() => setReloadKey(key => key + 1)} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold"><RefreshCw className="size-3.5" />Retry</button></div>}

    <div className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <section className="min-w-0 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="text-sm font-semibold">Messages over time</h2><p className="mt-1 text-xs text-muted-foreground">{hasActivity ? `${totals.received.toLocaleString()} received from people · ${totals.sent.toLocaleString()} sent by you and your workflows` : "Conversation activity will appear as data is collected."}</p></div>
          {hasActivity && <div className="inline-flex items-center gap-1 rounded-md bg-secondary p-0.5" role="group" aria-label="Display as">
            {(["chart", "table"] as const).map(option => <button key={option} type="button" onClick={() => setView(option)} aria-pressed={view === option} className={cn("rounded px-2.5 py-1 text-xs font-medium capitalize", view === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option}</button>)}
          </div>}
        </div>

        {!hasActivity ? <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><span className="flex size-11 items-center justify-center rounded-xl bg-secondary"><BarChart3 className="size-5 text-muted-foreground" /></span><h3 className="mt-4 text-sm font-medium">No conversations in the last {days} days</h3><p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">Once people message you and your workflows start replying, performance and audience trends will show here.</p><a href="/dashboard/automations" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold">Review workflows<ArrowUpRight className="size-3.5" /></a></div>
          : view === "chart" ? <div className="px-3 pb-4 pt-2 sm:px-5">
            <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
              <LineChart data={data!.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={value => formatDay(value)} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                <ChartTooltip cursor content={<ChartTooltipContent indicator="line" labelFormatter={value => formatDay(String(value), "long")} />} />
                <ChartLegend verticalAlign="top" content={<ChartLegendContent className="justify-end" />} />
                <Line dataKey="received" type="monotone" stroke="var(--color-received)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                <Line dataKey="sent" type="monotone" stroke="var(--color-sent)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
              </LineChart>
            </ChartContainer>
          </div>
          : <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr className="border-b border-border"><th scope="col" className="px-5 py-2.5 text-left font-medium">Day</th><th scope="col" className="px-5 py-2.5 text-right font-medium">Received</th><th scope="col" className="px-5 py-2.5 text-right font-medium">Sent</th></tr></thead>
              <tbody className="divide-y divide-border">{[...data!.series].reverse().map(row => <tr key={row.date}><td className="px-5 py-2">{formatDay(row.date, "long")}</td><td className="px-5 py-2 text-right tabular-nums">{row.received.toLocaleString()}</td><td className="px-5 py-2 text-right tabular-nums">{row.sent.toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>}
        {data?.truncated && <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Showing the most recent 50,000 messages for this period.</p>}
      </section>

      <aside className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Most active contacts</h2><p className="mt-1 text-xs text-muted-foreground">Last {days} days</p></div><Link href="/dashboard/inbox" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">Inbox<ArrowRight className="size-3.5" /></Link></div>
        {data?.topContacts.length ? <ol className="divide-y divide-border">
          {data.topContacts.map(contact => <li key={contact.id} className="flex items-center gap-3 px-5 py-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"><Users className="size-4 text-muted-foreground" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">@{contact.username}</p><p className="mt-0.5 text-xs text-muted-foreground">{contact.received} received · {contact.sent} sent</p></div><time className="text-xs text-muted-foreground" dateTime={contact.lastMessageAt}>{new Date(contact.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" })}</time></li>)}
        </ol> : <p className="px-5 py-10 text-center text-xs text-muted-foreground">No one has messaged you in this period.</p>}
      </aside>
    </div>
  </div>
}

function Metric({ label, value, hint, icon: Icon }: { label: string; value?: number | string; hint?: string; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="border-border py-6 sm:border-r sm:px-6 first:pl-0 last:border-r-0"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold tracking-tight">{typeof value === "number" ? value.toLocaleString() : value ?? "—"}</p>{hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}</div>
}
