import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

const RANGES = [7, 30, 90]
const PAGE_SIZE = 1000 // PostgREST max rows per request
const MAX_ROWS = 50000
const DAY_MS = 86400000

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

function safeTimeZone(value: string | null) {
    try {
        if (value) {
            new Intl.DateTimeFormat("en-CA", { timeZone: value })
            return value
        }
    } catch { }
    return "UTC"
}

/** Reads every row of a query, a page at a time. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
    const rows: T[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        const { data, error } = await build(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) return { rows, truncated: false }
    }
    return { rows, truncated: true }
}

async function countContacts(supabase: SupabaseClient, userId: string) {
    const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
    if (error) throw error
    return count || 0
}

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams
        const userId = params.get("userId")
        if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

        const days = RANGES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 30
        const timeZone = safeTimeZone(params.get("tz"))
        const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })

        // Calendar days in the viewer's time zone, oldest first ("YYYY-MM-DD")
        const today = new Date(`${dayKey.format(new Date())}T12:00:00Z`)
        const dates = Array.from({ length: days }, (_, i) =>
            new Date(today.getTime() - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10)
        )
        const firstDay = dates[0]
        // Over-fetch to cover any UTC offset, then filter by local day
        const since = new Date(today.getTime() - (days + 1) * DAY_MS).toISOString()

        const supabase = await getSupabaseServerClient()

        const [messages, newConversations, totalContacts] = await Promise.all([
            fetchAll<{ conversation_id: string; is_from_instagram: boolean; created_at: string }>((from, to) =>
                supabase
                    .from("messages")
                    .select("conversation_id, is_from_instagram, created_at")
                    .eq("user_id", userId)
                    .gte("created_at", since)
                    .order("created_at", { ascending: true })
                    .order("id", { ascending: true })
                    .range(from, to)
            ),
            fetchAll<{ id: string; created_at: string }>((from, to) =>
                supabase
                    .from("conversations")
                    .select("id, created_at")
                    .eq("user_id", userId)
                    .gte("created_at", since)
                    .order("created_at", { ascending: true })
                    .range(from, to)
            ),
            countContacts(supabase, userId),
        ])

        const series = new Map(dates.map(date => [date, { date, received: 0, sent: 0 }]))
        const perConversation = new Map<string, { received: number; sent: number; lastMessageAt: string }>()
        const wroteIn = new Set<string>()
        const answered = new Set<string>()
        let received = 0
        let sent = 0

        for (const message of messages.rows) {
            const day = series.get(dayKey.format(new Date(message.created_at)))
            if (!day) continue

            const stats = perConversation.get(message.conversation_id) || { received: 0, sent: 0, lastMessageAt: message.created_at }
            stats.lastMessageAt = message.created_at
            if (message.is_from_instagram) {
                day.received++
                received++
                stats.received++
                wroteIn.add(message.conversation_id)
            } else {
                day.sent++
                sent++
                stats.sent++
                answered.add(message.conversation_id)
            }
            perConversation.set(message.conversation_id, stats)
        }

        const answeredCount = [...wroteIn].filter(id => answered.has(id)).length
        const newContacts = newConversations.rows.filter(row => dayKey.format(new Date(row.created_at)) >= firstDay).length

        // Most active people in the period
        const top = [...perConversation.entries()]
            .sort(([, a], [, b]) => (b.received + b.sent) - (a.received + a.sent))
            .slice(0, 5)

        let usernames = new Map<string, string>()
        if (top.length) {
            const { data, error } = await supabase
                .from("conversations")
                .select("id, recipient_username")
                .in("id", top.map(([id]) => id))
            if (error) throw error
            usernames = new Map((data || []).map(row => [row.id, row.recipient_username]))
        }

        return NextResponse.json({
            days,
            totals: {
                activeConversations: perConversation.size,
                newContacts,
                totalContacts,
                received,
                sent,
                conversationsWithIncoming: wroteIn.size,
                conversationsAnswered: answeredCount,
                responseRate: wroteIn.size ? answeredCount / wroteIn.size : null,
            },
            series: [...series.values()],
            topContacts: top.map(([id, stats]) => ({ id, username: usernames.get(id) || "instagram_user", ...stats })),
            truncated: messages.truncated || newConversations.truncated,
        })
    } catch (error: any) {
        console.error("[Analytics] GET error:", error)
        return NextResponse.json({ error: error?.message || "Failed to load insights" }, { status: 500 })
    }
}
