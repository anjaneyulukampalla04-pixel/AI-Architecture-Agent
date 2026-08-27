from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import StreamingResponse
from sqlalchemy import select

import os
import json

from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

from app.database import get_db

from app.models import (
    User,
    ArchitectureVersion,
    Document,
    Conversation,
    Message,
)

from app.schemas import ChatMessageCreate

from app.middleware.auth_middleware import (
    get_current_user
)


# ============================================================
# LOAD BACKEND .env
# ============================================================

BACKEND_DIR = (
    Path(__file__).resolve().parents[2]
)

ENV_FILE = (
    BACKEND_DIR / ".env"
)

load_dotenv(
    ENV_FILE,
    override=True
)


print(
    f"[CHAT] Loading environment from: "
    f"{ENV_FILE}"
)

print(
    f"[CHAT] Environment file exists: "
    f"{ENV_FILE.exists()}"
)

print(
    f"[CHAT] LLM provider: "
    f"{os.getenv('LLM_PROVIDER', 'groq')}"
)


router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)


# ============================================================
# RAW PDF DETECTION
# ============================================================

def is_raw_pdf_content(
    text: str
) -> bool:
    """
    Detect accidentally stored raw PDF internals.

    Older uploaded PDFs may have been opened as UTF-8 text
    and stored in Document.extractedText.

    We NEVER want to send that data to the LLM.
    """

    if not text:

        return False


    markers = [

        "%PDF-",

        "/Type /Page",

        "/MediaBox",

        "/Resources",

        "endobj",

        "startxref",

        "%%EOF",

        "xref",
    ]


    matches = sum(

        1

        for marker in markers

        if marker in text
    )


    return matches >= 2


# ============================================================
# CLEAN DOCUMENT CONTEXT
# ============================================================

def clean_document_context(
    text: str,
    max_length: int = 5000
) -> str:
    """
    Prepare extracted document text before sending it to
    Groq/Gemini.
    """

    if not text:

        return ""


    text = text.replace(
        "\x00",
        ""
    )


    # --------------------------------------------------------
    # Old raw PDF data
    # --------------------------------------------------------

    if is_raw_pdf_content(text):

        return ""


    # --------------------------------------------------------
    # Remove problematic control characters
    # --------------------------------------------------------

    cleaned_characters = []


    for character in text:

        if (
            character in "\n\r\t"
            or ord(character) >= 32
        ):

            cleaned_characters.append(
                character
            )


    text = "".join(
        cleaned_characters
    )


    # --------------------------------------------------------
    # Normalise whitespace
    # --------------------------------------------------------

    lines = []

    for line in text.splitlines():

        line = line.strip()

        if line:

            lines.append(line)


    text = "\n".join(lines)


    return text[:max_length]


# ============================================================
# LLM CLIENT
# ============================================================

def _make_client(
    provider: str
):

    provider = (
        provider
        .lower()
        .strip()
    )


    # ========================================================
    # GROQ
    # ========================================================

    if provider == "groq":

        api_key = (

            os.getenv(
                "GROQ_API_KEYS",
                ""
            )

            .split(",")[0]

            .strip()
        )


        if not api_key:

            raise RuntimeError(
                "GROQ_API_KEYS is missing "
                "from backend/.env"
            )


        client = AsyncOpenAI(

            api_key=api_key,

            base_url=os.getenv(

                "GROQ_BASE_URL",

                "https://api.groq.com/openai/v1"
            ),
        )


        model = os.getenv(

            "GROQ_MODEL",

            "llama-3.3-70b-versatile"
        )


        return (
            client,
            model
        )


    # ========================================================
    # GEMINI
    # ========================================================

    if provider == "gemini":

        api_key = (

            os.getenv(
                "GEMINI_API_KEYS",
                ""
            )

            .split(",")[0]

            .strip()
        )


        if not api_key:

            raise RuntimeError(
                "GEMINI_API_KEYS is missing "
                "from backend/.env"
            )


        client = AsyncOpenAI(

            api_key=api_key,

            base_url=os.getenv(

                "GEMINI_BASE_URL",

                "https://generativelanguage.googleapis.com/"
                "v1beta/openai"
            ),
        )


        model = os.getenv(

            "GEMINI_MODEL",

            "gemini-2.5-flash"
        )


        return (
            client,
            model
        )


    raise RuntimeError(
        f"Unsupported LLM provider: "
        f"{provider}"
    )


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are an AI Architecture Assistant.

You can behave like a general conversational AI assistant,
but you also have access to the user's software architecture
project context.

Rules:

1. GENERAL ASSISTANT

You may answer general programming, software engineering,
AI, cloud computing, database, DevOps and architecture
questions.


2. ARCHITECTURE AWARENESS

When the user asks about their project, use the supplied
project context to provide accurate explanations.


3. COMPONENT EXPLANATION

When asked to explain an architecture component such as a
Load Balancer, API Server, Database, Queue or Cache:

- Explain what the component does.
- Explain why it exists in this architecture.
- Explain how it interacts with nearby components.
- Explain scalability considerations.
- Explain security considerations when relevant.
- Keep explanations understandable for students and developers.


4. PROJECT CONTEXT

Prefer information from the supplied project context when
discussing the user's architecture.


5. DOCUMENT CONTEXT

Uploaded document text may be included in the project context.

Use it only when it is relevant to the user's question.

Never reproduce internal document encoding, binary data,
PDF object structures, PDF metadata or corrupted file data.


6. RESPONSE QUALITY

Do not unnecessarily dump every component, API or database
table unless explicitly requested.

Keep responses clear, professional and useful.
"""


# ============================================================
# SSE ENCODING
# ============================================================

def encode_sse(
    text: str
) -> str:
    """
    Encode text safely as a Server-Sent Event.

    JSON encoding prevents newlines and special characters
    from corrupting SSE framing.
    """

    payload = json.dumps(
        {
            "text": text
        },
        ensure_ascii=False
    )

    return (
        f"data: {payload}\n\n"
    )


# ============================================================
# STREAM LLM RESPONSE
# ============================================================

async def stream_ai_response(
    user_message: str,
    context: str = ""
):

    provider = (

        os.getenv(
            "LLM_PROVIDER",
            "groq"
        )

        .lower()

        .strip()
    )


    messages = [

        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]


    if context:

        messages.append(

            {
                "role": "system",

                "content":
                    "PROJECT CONTEXT\n"
                    "---------------\n"
                    f"{context}"
            }
        )


    messages.append(

        {
            "role": "user",

            "content":
                user_message
        }
    )


    # ========================================================
    # PRIMARY PROVIDER
    # ========================================================

    try:

        client, model = (
            _make_client(provider)
        )


        print(
            f"[CHAT] Sending request using "
            f"provider={provider}, "
            f"model={model}"
        )


        stream = await (
            client
            .chat
            .completions
            .create(

                model=model,

                messages=messages,

                stream=True,

                max_tokens=1024,

                temperature=0.7,
            )
        )


        async for chunk in stream:

            if not chunk.choices:

                continue


            delta = (
                chunk
                .choices[0]
                .delta
                .content
            )


            if delta:

                yield encode_sse(
                    delta
                )


        yield "data: [DONE]\n\n"

        return


    except Exception as primary_error:

        print("=" * 70)

        print(
            "[CHAT] PRIMARY LLM FAILED"
        )

        print(
            f"[CHAT] Provider: "
            f"{provider}"
        )

        print(
            f"[CHAT] Error: "
            f"{repr(primary_error)}"
        )

        print("=" * 70)


    # ========================================================
    # GEMINI FALLBACK
    # ========================================================

    if provider == "groq":

        try:

            client, model = (
                _make_client(
                    "gemini"
                )
            )


            print(
                f"[CHAT] Trying fallback "
                f"provider=gemini, "
                f"model={model}"
            )


            stream = await (

                client
                .chat
                .completions
                .create(

                    model=model,

                    messages=messages,

                    stream=True,

                    max_tokens=1024,

                    temperature=0.7,
                )
            )


            async for chunk in stream:

                if not chunk.choices:

                    continue


                delta = (
                    chunk
                    .choices[0]
                    .delta
                    .content
                )


                if delta:

                    yield encode_sse(
                        delta
                    )


            yield "data: [DONE]\n\n"

            return


        except Exception as fallback_error:

            print("=" * 70)

            print(
                "[CHAT] GEMINI FALLBACK FAILED"
            )

            print(
                f"[CHAT] Error: "
                f"{repr(fallback_error)}"
            )

            print("=" * 70)


            yield encode_sse(
                "⚠️ AI service unavailable. "
                "Check the backend terminal "
                "for the LLM error."
            )

            yield "data: [DONE]\n\n"

            return


    # ========================================================
    # NO FALLBACK
    # ========================================================

    yield encode_sse(
        "⚠️ AI service unavailable. "
        "Check the backend terminal "
        "for the LLM error."
    )

    yield "data: [DONE]\n\n"


# ============================================================
# CHAT ENDPOINT
# ============================================================

@router.post(
    "/{projectId}/messages"
)
async def send_message(
    projectId: str,
    message: ChatMessageCreate,
    current_user: User = Depends(
        get_current_user
    ),
    db: AsyncSession = Depends(
        get_db
    ),
):

    context_parts = []


    # ========================================================
    # BUILD PROJECT CONTEXT
    # ========================================================

    try:

        ver_result = await db.execute(

            select(
                ArchitectureVersion
            )

            .where(
                ArchitectureVersion.projectId
                == projectId
            )

            .order_by(
                ArchitectureVersion
                .versionNumber
                .desc()
            )
        )


        version = (
            ver_result
            .scalars()
            .first()
        )


        if (
            version
            and version.architectureData
        ):

            architecture = (

                version.architectureData

                if isinstance(
                    version.architectureData,
                    dict
                )

                else json.loads(
                    version.architectureData
                )
            )


            # =================================================
            # COMPONENTS
            # =================================================

            components = (
                architecture.get(
                    "components",
                    []
                )
            )


            if components:

                component_names = ", ".join(

                    component.get(
                        "name",
                        ""
                    )

                    for component
                    in components[:10]

                    if component.get(
                        "name"
                    )
                )


                if component_names:

                    context_parts.append(

                        "System components: "
                        f"{component_names}"
                    )


            # =================================================
            # APIs
            # =================================================

            apis = (
                architecture.get(
                    "apis",
                    []
                )
            )


            if apis:

                api_list = ", ".join(

                    (
                        f"{api.get('method', '')} "
                        f"{api.get('path', '')}"
                    ).strip()

                    for api
                    in apis[:8]
                )


                if api_list:

                    context_parts.append(
                        f"APIs: {api_list}"
                    )


            # =================================================
            # DATABASE
            # =================================================

            schema = (
                architecture.get(
                    "database_schema",
                    []
                )
            )


            if schema:

                table_names = ", ".join(

                    table.get(
                        "name",
                        ""
                    )

                    for table
                    in schema[:8]

                    if table.get(
                        "name"
                    )
                )


                if table_names:

                    context_parts.append(

                        "Database tables: "
                        f"{table_names}"
                    )


            # =================================================
            # DOCUMENTATION
            # =================================================

            documentation = (
                architecture.get(
                    "documentation",
                    ""
                )
            )


            if documentation:

                clean_documentation = (
                    clean_document_context(
                        str(documentation),
                        max_length=1500
                    )
                )


                if clean_documentation:

                    context_parts.append(

                        "Architecture documentation:\n"
                        f"{clean_documentation}"
                    )


        # ====================================================
        # LATEST UPLOADED DOCUMENT
        # ====================================================

        doc_result = await db.execute(

            select(Document)

            .where(
                Document.projectId
                == projectId
            )

            .order_by(
                Document
                .createdAt
                .desc()
            )
        )


        latest_document = (
            doc_result
            .scalars()
            .first()
        )


        if (
            latest_document
            and latest_document.extractedText
        ):

            raw_text = (
                latest_document
                .extractedText
            )


            # ------------------------------------------------
            # Detect old corrupted PDF extraction
            # ------------------------------------------------

            if is_raw_pdf_content(
                raw_text
            ):

                print(
                    f"[CHAT] WARNING: "
                    f"Skipping raw PDF context "
                    f"from old document: "
                    f"{latest_document.name}"
                )


            else:

                document_text = (
                    clean_document_context(
                        raw_text,
                        max_length=5000
                    )
                )


                if document_text:

                    context_parts.append(

                        "Uploaded document "
                        f"({latest_document.name}):\n"
                        f"{document_text}"
                    )


    except Exception as context_error:

        print(
            "[CHAT] Failed to build "
            "project context:",
            repr(context_error)
        )


    context = "\n\n".join(
        context_parts
    )


    print(
        f"[CHAT] Context length: "
        f"{len(context)} characters"
    )


    # ========================================================
    # GET OR CREATE CONVERSATION
    # ========================================================

    conv_result = await db.execute(

        select(Conversation)

        .where(
            Conversation.projectId
            == projectId
        )
    )


    conversation = (
        conv_result
        .scalars()
        .first()
    )


    if not conversation:

        conversation = Conversation(

            projectId=projectId,

            title="Project Chat"
        )


        db.add(
            conversation
        )


        await db.commit()


        await db.refresh(
            conversation
        )


    # ========================================================
    # SAVE USER MESSAGE
    # ========================================================

    user_message = Message(

        conversationId=
            conversation.id,

        sender="user",

        content=
            message.content
    )


    db.add(
        user_message
    )


    await db.commit()


    # ========================================================
    # STREAM RESPONSE
    # ========================================================

    async def stream_wrapper():

        full_response = ""


        async for chunk in stream_ai_response(

            message.content,

            context
        ):

            # ------------------------------------------------
            # Save AI text
            # ------------------------------------------------

            if chunk.startswith(
                "data: "
            ):

                payload = (
                    chunk[6:]
                    .strip()
                )


                if (
                    payload
                    and payload != "[DONE]"
                ):

                    try:

                        parsed = json.loads(
                            payload
                        )


                        text = parsed.get(
                            "text",
                            ""
                        )


                        if text:

                            full_response += text


                    except json.JSONDecodeError:

                        print(
                            "[CHAT] Could not "
                            "decode SSE payload:",
                            payload[:100]
                        )


            yield chunk


        # ====================================================
        # SAVE ASSISTANT MESSAGE
        # ====================================================

        if full_response.strip():

            try:

                assistant_message = Message(

                    conversationId=
                        conversation.id,

                    sender="assistant",

                    content=
                        full_response
                )


                db.add(
                    assistant_message
                )


                await db.commit()


            except Exception as save_error:

                print(
                    "[CHAT] Error saving "
                    "AI message:",
                    repr(save_error)
                )


    # ========================================================
    # STREAMING RESPONSE
    # ========================================================

    return StreamingResponse(

        stream_wrapper(),

        media_type=
            "text/event-stream",

        headers={

            "Cache-Control":
                "no-cache",

            "X-Accel-Buffering":
                "no",

            "Connection":
                "keep-alive",
        },
    )