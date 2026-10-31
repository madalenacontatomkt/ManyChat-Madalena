import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

const GRAPH = "https://graph.instagram.com/v24.0"
const MAX_ICE_BREAKERS = 4 // Instagram limit
const MAX_QUESTION_LENGTH = 80

function errorMessage(error: any): string {
    return error?.message || error?.error_user_msg || String(error)
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const userId = searchParams.get("userId")

        if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase
            .from("ice_breakers")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })

        if (error) throw error

        return NextResponse.json(data)
    } catch (error) {
        console.error("Ice Breaker GET Error:", error)
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
    }
}

/**
 * Pushes the list to Instagram. An empty list removes the ice breakers from the profile.
 * Format: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ice-breakers
 */
async function syncToInstagram(accessToken: string, rows: { id: string; question: string }[]) {
    const url = `${GRAPH}/me/messenger_profile?access_token=${encodeURIComponent(accessToken)}`
    const res = rows.length
        ? await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                platform: "instagram",
                ice_breakers: [{
                    call_to_actions: rows.map(row => ({ question: row.question, payload: `ICE_BREAKER_${row.id}` })),
                }],
            }),
        })
        : await fetch(url, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: ["ice_breakers"] }),
        })

    const result = await res.json().catch(() => ({}))
    if (!res.ok || result.error) {
        throw new Error(result.error?.error_user_msg || result.error?.message || `Instagram returned HTTP ${res.status}`)
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { userId, iceBreakers } = body // Array of ice breakers

        if (!userId || !Array.isArray(iceBreakers)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
        }

        const items = iceBreakers.map((ib: any) => ({
            id: typeof ib.id === "string" ? ib.id : undefined,
            question: String(ib.question ?? "").trim(),
            response: String(ib.response ?? "").trim(),
        }))

        if (items.length > MAX_ICE_BREAKERS) {
            return NextResponse.json({ error: `Instagram allows at most ${MAX_ICE_BREAKERS} conversation starters` }, { status: 400 })
        }
        if (items.some(item => !item.question || !item.response)) {
            return NextResponse.json({ error: "Every conversation starter needs a question and a response" }, { status: 400 })
        }
        if (items.some(item => item.question.length > MAX_QUESTION_LENGTH)) {
            return NextResponse.json({ error: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer` }, { status: 400 })
        }

        const supabase = await getSupabaseServerClient()

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("access_token")
            .eq("id", userId)
            .single()

        if (userError || !user) {
            return NextResponse.json({ error: "User not found. Reconnect your Instagram account." }, { status: 404 })
        }

        // 1. Save to the database. Existing rows keep their id so the payload of
        // ice breakers already cached on people's devices keeps resolving in the webhook.
        const { data: existing, error: existingError } = await supabase
            .from("ice_breakers")
            .select("id")
            .eq("user_id", userId)

        if (existingError) throw existingError

        const existingIds = new Set((existing || []).map(row => row.id))
        const rows = items.map(item => ({
            id: item.id && existingIds.has(item.id) ? item.id : randomUUID(),
            user_id: userId,
            question: item.question,
            response: item.response,
            is_active: true,
        }))

        if (rows.length) {
            const { error: upsertError } = await supabase.from("ice_breakers").upsert(rows, { onConflict: "id" })
            if (upsertError) throw upsertError
        }

        const removeQuery = supabase.from("ice_breakers").delete().eq("user_id", userId)
        const { error: deleteError } = rows.length
            ? await removeQuery.not("id", "in", `(${rows.map(row => row.id).join(",")})`)
            : await removeQuery

        if (deleteError) throw deleteError

        const { data: saved, error: savedError } = await supabase
            .from("ice_breakers")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })

        if (savedError) throw savedError

        // 2. Sync to Instagram, in the order shown in the editor
        try {
            await syncToInstagram(user.access_token, rows)
        } catch (syncError) {
            console.error("IG Sync Error", syncError)
            return NextResponse.json({ success: true, synced: false, error: errorMessage(syncError), data: saved })
        }

        return NextResponse.json({ success: true, synced: true, data: saved })

    } catch (error) {
        console.error("Ice Breaker POST Error:", error)
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
    }
}
