from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import AttendeeProfile, ScoreRequest
from app.scoring import score_match


def _profile(name: str, **overrides) -> AttendeeProfile:
    base = {
        "attendee_id": f"id-{name}",
        "name": name,
        "headline": "Headline",
        "bio": "Bio",
        "company": "Co",
        "role": "engineer",
        "skills": ["x"],
        "looking_for": "lf",
    }
    base.update(overrides)
    return AttendeeProfile(**base)


def _make_request() -> ScoreRequest:
    return ScoreRequest(
        requester=_profile("Andika"),
        candidate=_profile("Sarah"),
        intent="find AI startup co-founder",
    )


@pytest.mark.asyncio
async def test_returns_structured_response_from_tool_use_block():
    tool_block = SimpleNamespace(
        type="tool_use",
        name="submit_score",
        input={
            "score": 87,
            "rationale": "Both work in B2B fintech in Southeast Asia.",
            "shared_ground": ["fintech", "SEA market", "B2B SaaS"],
        },
    )
    fake_response = SimpleNamespace(content=[tool_block])

    fake_client = MagicMock()
    fake_client.messages.create = AsyncMock(return_value=fake_response)

    result = await score_match(_make_request(), fake_client)

    assert result.score == 87
    assert "fintech" in result.shared_ground
    fake_client.messages.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_raises_when_no_tool_use_block_in_response():
    text_block = SimpleNamespace(type="text", text="some text")
    fake_response = SimpleNamespace(content=[text_block])

    fake_client = MagicMock()
    fake_client.messages.create = AsyncMock(return_value=fake_response)

    with pytest.raises(ValueError, match="submit_score"):
        await score_match(_make_request(), fake_client)
