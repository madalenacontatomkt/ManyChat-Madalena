import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get("userId")
        if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

        const supabase = await getSupabaseServerClient()

        // Fetch conversations sorted by last message, each with its latest message for the preview
        const { data: conversations, error } = await supabase
            .from("conversations")
            .select("*, messages(content, is_from_instagram, created_at)")
            .eq("user_id", userId)
            .order("last_message_at", { ascending: false })
            .order("created_at", { referencedTable: "messages", ascending: false })
            .limit(1, { referencedTable: "messages" })

        if (error) throw error

        return NextResponse.json(
            (conversations || []).map(({ messages, ...conversation }) => ({
                ...conversation,
                last_message: messages?.[0] ?? null,
            }))
        )
    } catch (error) {
        console.error("[Inbox] Conversations GET error:", error)
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
    }
}
