"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Loader2, UserCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/types/db"

const REFRESH_INTERVAL_MS = 15000

interface ConversationListProps {
    userId: string
    selectedId: string | null
    onSelect: (id: string, username: string, recipientId: string) => void
}

function formatTimestamp(value: string) {
    const date = new Date(value)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
    const sixDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    if (date >= sixDaysAgo) {
        return date.toLocaleDateString([], { weekday: "short" })
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function ConversationList({ userId, selectedId, onSelect }: ConversationListProps) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [query, setQuery] = useState("")

    const fetchConversations = useCallback(async () => {
        try {
            const res = await fetch(`/api/inbox/conversations?userId=${userId}`, { cache: "no-store" })
            const data = await res.json()
            if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || "Failed to load conversations")
            setConversations(data)
            setError(null)
        } catch (err) {
            console.error("Failed to load conversations", err)
            setError(err instanceof Error ? err.message : "Failed to load conversations")
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        fetchConversations()
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") fetchConversations()
        }, REFRESH_INTERVAL_MS)
        window.addEventListener("focus", fetchConversations)
        return () => {
            clearInterval(interval)
            window.removeEventListener("focus", fetchConversations)
        }
    }, [userId, fetchConversations])

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase()
        if (!term) return conversations
        return conversations.filter(conv =>
            conv.recipient_username?.toLowerCase().includes(term) ||
            conv.last_message?.content?.toLowerCase().includes(term)
        )
    }, [conversations, query])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full border-r border-border bg-card w-full md:w-[350px]">
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">{conversations.length}</span>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        aria-label="Search conversations"
                        className="w-full bg-background border border-input rounded-xl pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                        placeholder="Search by name or message..."
                    />
                </div>
            </div>

            {error && (
                <div role="alert" className="mx-2 mt-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <span className="min-w-0 truncate">{error}</span>
                    <button onClick={fetchConversations} className="inline-flex shrink-0 items-center gap-1 font-semibold">
                        <RefreshCw className="w-3 h-3" />Retry
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        {query ? `No conversations match "${query}".` : "No conversations yet."}
                    </div>
                ) : (
                    filtered.map((conv) => {
                        const last = conv.last_message
                        return (
                            <button
                                type="button"
                                key={conv.id}
                                onClick={() => onSelect(conv.id, conv.recipient_username, conv.recipient_id.toString())}
                                className={cn(
                                    "w-full p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors border border-transparent",
                                    selectedId === conv.id
                                        ? "bg-accent border-border"
                                        : "hover:bg-accent hover:border-border"
                                )}
                            >
                                <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                                    <UserCircle className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <span className={cn(
                                            "font-semibold text-sm truncate",
                                            selectedId === conv.id ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-foreground"
                                        )}>
                                            {conv.recipient_username}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                            {formatTimestamp(last?.created_at || conv.last_message_at)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {last
                                            ? `${last.is_from_instagram ? "" : "You: "}${last.content}`
                                            : "No messages yet"}
                                    </p>
                                </div>
                            </button>
                        )
                    })
                )}
            </div>
        </div>
    )
}
