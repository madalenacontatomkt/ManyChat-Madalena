export interface Conversation {
    id: string
    user_id: string
    recipient_id: string
    recipient_username: string
    last_message_at: string
    created_at: string
    updated_at: string
    last_message?: Pick<Message, "content" | "is_from_instagram" | "created_at"> | null
}

export interface Message {
    id: string
    conversation_id: string
    user_id: string
    sender_id: string
    sender_username?: string
    content: string
    is_from_instagram: boolean
    created_at: string
}

export interface IceBreaker {
    id: string
    user_id: string
    question: string
    response: string
    is_active: boolean
    created_at: string
}
