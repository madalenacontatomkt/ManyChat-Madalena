"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { Send, Loader2, Zap, ChevronLeft, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Message } from "@/types/db"

const REFRESH_INTERVAL_MS = 5000

function quickReplyText(automation: any): string {
    let content = automation.response_content
    if (typeof content === "string") {
        try { content = JSON.parse(content) } catch { return content }
    }
    return content?.message || automation.name
}

interface ChatWindowProps {
    conversationId: string | null
    recipientId?: string
    recipientName: string | null
    userId: string
    onBack?: () => void
}

export function ChatWindow({ conversationId, recipientId, recipientName, userId, onBack }: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)
    const [inputText, setInputText] = useState("")
    const [sending, setSending] = useState(false)
    const [isAutomationOpen, setIsAutomationOpen] = useState(false)
    const [automations, setAutomations] = useState<any[]>([])
    const bottomRef = useRef<HTMLDivElement>(null)

    const activeConversation = useRef(conversationId)
    activeConversation.current = conversationId

    const fetchMessages = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/inbox/messages?conversationId=${id}`, { cache: "no-store" })
            const data = await res.json()
            // Ignore responses for a conversation the user already left
            if (activeConversation.current === id && Array.isArray(data)) {
                setMessages(data)
            }
        } catch (error) {
            console.error("Failed to load messages", error)
        }
    }, [])

    useEffect(() => {
        if (!conversationId) return

        setMessages([])
        setLoading(true)
        fetchMessages(conversationId).finally(() => {
            if (activeConversation.current === conversationId) setLoading(false)
        })

        const interval = setInterval(() => {
            if (document.visibilityState === "visible") fetchMessages(conversationId)
        }, REFRESH_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [conversationId, fetchMessages])

    // Fetch automations for quick reply
    useEffect(() => {
        if (userId) {
            fetch(`/api/automations?userId=${userId}`).then(res => res.json()).then(data => {
                if (Array.isArray(data)) setAutomations(data)
            })
        }
    }, [userId])

    // Only scroll when a message is added, so background refreshes don't yank the view
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages.length])

    const handleSendMessage = async (text: string = inputText) => {
        if (!text.trim() || !recipientId || !userId) return

        setSending(true)
        try {
            const res = await fetch("/api/inbox/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    recipientId,
                    message: text
                })
            })

            if (res.ok) {
                setInputText("")
                // Optimistic update
                const newMsg: Message = {
                    id: `temp_${Date.now()}`,
                    conversation_id: conversationId!,
                    user_id: userId,
                    sender_id: "me",
                    sender_username: "Me",
                    content: text,
                    is_from_instagram: false,
                    created_at: new Date().toISOString()
                }
                setMessages(prev => [...prev, newMsg])
                fetchMessages(conversationId!)
            } else {
                const data = await res.json().catch(() => null)
                toast.error(data?.error || "Message not sent")
            }
        } catch (e) {
            console.error("Send failed", e)
            toast.error("Message not sent. Check your connection and try again.")
        } finally {
            setSending(false)
            setIsAutomationOpen(false)
        }
    }

    if (!conversationId) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center bg-card h-full">
                <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
                    <Send className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Your conversations</h3>
                    <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                        Select a conversation from the left to start chatting live with your audience.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-card relative">
            {/* Header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card shrink-0">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden -ml-2 text-muted-foreground">
                            <ChevronLeft className="w-6 h-6" />
                        </Button>
                    )}
                    <div className="w-8 h-8 rounded-full bg-muted border border-border shrink-0" />
                    <div className="min-w-0">
                        <h3 className="font-bold text-foreground text-sm truncate">@{recipientName}</h3>
                        <span className="hidden md:block text-[10px] text-muted-foreground">Instagram Direct</span>
                    </div>
                </div>
                {recipientName && (
                    <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                        <a href={`https://instagram.com/${recipientName}`} target="_blank" rel="noopener noreferrer">
                            <span className="hidden md:inline">View profile</span>
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </Button>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        No messages saved for this conversation yet.
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = !msg.is_from_instagram
                        return (
                            <div key={msg.id} className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
                                <div className={cn(
                                    "max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm break-words",
                                    isMe
                                        ? "bg-primary text-primary-foreground rounded-br-none"
                                        : "bg-muted text-foreground rounded-bl-none border border-border"
                                )}>
                                    {msg.content}
                                    <div className={cn(
                                        "text-[10px] mt-1 opacity-70",
                                        isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                                    )}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Automation Popup */}
            {isAutomationOpen && (
                <div className="absolute bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-popover border border-border rounded-xl shadow-lg p-2 z-50">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Quick Responses</div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                        {automations.map(auto => (
                            <button
                                key={auto.id}
                                onClick={() => handleSendMessage(quickReplyText(auto))}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-popover-foreground transition-colors flex items-center gap-2"
                            >
                                <Zap className="w-3 h-3 text-accent-yellow-foreground dark:text-accent-yellow" />
                                <span className="truncate">{auto.name}</span>
                            </button>
                        ))}
                        {automations.length === 0 && (
                            <div className="px-3 py-4 text-center text-muted-foreground text-xs">No automations found.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-3 md:p-4 border-t border-border bg-card shrink-0">
                <div className="flex items-center gap-2 bg-muted rounded-xl border border-border p-1.5 focus-within:border-accent-yellow focus-within:ring-2 focus-within:ring-accent-yellow/30 transition-all">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setIsAutomationOpen(!isAutomationOpen)}
                        aria-label="Toggle quick responses"
                        className={cn(
                            "h-9 w-9 hover:bg-accent text-muted-foreground hover:text-accent-yellow-foreground dark:hover:text-accent-yellow transition-colors shrink-0",
                            isAutomationOpen && "text-foreground bg-accent"
                        )}
                    >
                        <Zap className="w-5 h-5" />
                    </Button>
                    <input
                        className="flex-1 bg-muted px-3 py-2 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground min-w-0"
                        placeholder="Type a message..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !sending) {
                                e.preventDefault()
                                handleSendMessage()
                            }
                        }}
                        disabled={sending}
                    />
                    <Button
                        onClick={() => handleSendMessage()}
                        disabled={sending || !inputText.trim()}
                        size="icon"
                        aria-label="Send message"
                        className="h-9 w-9 bg-primary text-primary-foreground hover:opacity-90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
        </div>
    )
}
